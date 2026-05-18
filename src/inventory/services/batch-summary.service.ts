import { Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import type { Queue } from 'bullmq';
import { Between, Repository } from 'typeorm';
import { DistributedLockService } from '../../common/distributed-lock.service';
import {
    Order,
    OrderStatus,
    PaymentStatus,
} from '../../database/entities/order.entity';
import { SalesSummary } from '../../database/entities/sales-summary.entity';
import {
    BATCH_SUMMARY_QUEUE,
    DEFAULT_QUEUE_JOB_OPTIONS,
    PROCESS_BATCH_SUMMARY_JOB,
} from '../../queues/queue.constants';
import type { BatchSummaryJobData } from '../../queues/queue.types';

const BATCH_CHUNK_SIZE = 100;
const CRON_LOCK_KEY = 'cron:batch-summary';
const CRON_LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class BatchSummaryService {
    private readonly logger = new Logger(BatchSummaryService.name);

    constructor(
        @InjectQueue(BATCH_SUMMARY_QUEUE)
        private readonly batchSummaryQueue: Queue<BatchSummaryJobData>,
        @InjectRepository(Order)
        private readonly ordersRepository: Repository<Order>,
        @InjectRepository(SalesSummary)
        private readonly salesSummaryRepository: Repository<SalesSummary>,
        private readonly distributedLock: DistributedLockService,
    ) {}

    getQueue(): Queue<BatchSummaryJobData> {
        return this.batchSummaryQueue;
    }

    private getLastMonthRange() {
        const now = new Date();
        const firstDayThisMonth = new Date(
            now.getFullYear(),
            now.getMonth(),
            1,
        );
        const firstDayLastMonth = new Date(firstDayThisMonth);
        firstDayLastMonth.setMonth(firstDayLastMonth.getMonth() - 1);

        return {
            startDate: firstDayLastMonth,
            endDate: firstDayThisMonth,
            label: `${firstDayLastMonth.getFullYear()}-${String(firstDayLastMonth.getMonth() + 1).padStart(2, '0')}`,
        };
    }

    async enqueueBatchSummary() {
        const { startDate, endDate, label } = this.getLastMonthRange();
        return this.enqueueBatchSummaryForRange(startDate, endDate, label);
    }

    async enqueueBatchSummaryForMonth(year: number, month: number) {
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 1);
        const label = `${year}-${String(month).padStart(2, '0')}`;
        return this.enqueueBatchSummaryForRange(startDate, endDate, label);
    }

    private async enqueueBatchSummaryForRange(
        startDate: Date,
        endDate: Date,
        label: string,
    ) {
        const totalOrders = await this.ordersRepository.count({
            where: {
                status: OrderStatus.Completed,
                paymentStatus: PaymentStatus.Paid,
                createdAt: Between(startDate, endDate),
            },
        });

        if (totalOrders === 0) {
            this.logger.log(`No orders found for ${label}`);
            return { enqueued: 0, period: label };
        }

        const totalChunks = Math.ceil(totalOrders / BATCH_CHUNK_SIZE);
        const jobs: BatchSummaryJobData[] = [];

        for (let i = 0; i < totalChunks; i++) {
            jobs.push({
                offset: i * BATCH_CHUNK_SIZE,
                limit: BATCH_CHUNK_SIZE,
                chunkIndex: i,
                totalChunks,
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
                periodLabel: label,
            });
        }

        const added = await this.batchSummaryQueue.addBulk(
            jobs.map((data) => ({
                name: PROCESS_BATCH_SUMMARY_JOB,
                data,
                opts: {
                    ...DEFAULT_QUEUE_JOB_OPTIONS,
                    jobId: `${PROCESS_BATCH_SUMMARY_JOB}-${label}-${Date.now()}-chunk-${data.chunkIndex}`,
                },
            })),
        );

        this.logger.log(
            `Enqueued ${added.length} chunk jobs for ${totalOrders} orders (${label})`,
        );

        return {
            enqueued: added.length,
            totalOrders,
            totalChunks,
            period: label,
        };
    }

    // @Cron(CronExpression.EVERY_MINUTE)
    @Cron('0 2 1 * *')
    async handleScheduledBatchSummary() {
        const acquired = await this.distributedLock.acquire(
            CRON_LOCK_KEY,
            CRON_LOCK_TTL_MS,
        );
        if (!acquired) {
            this.logger.log('Another instance holds the cron lock, skipping');
            return;
        }

        try {
            this.logger.log(
                'Monthly batch summary triggered (1st of month at 2:00 AM)',
            );
            return await this.enqueueBatchSummary();
        } finally {
            await this.distributedLock.release(CRON_LOCK_KEY);
        }
    }

    async processChunk(jobData: BatchSummaryJobData) {
        const { offset, limit, chunkIndex, totalChunks, startDate, endDate } =
            jobData;

        this.logger.log(
            `Worker processing chunk ${chunkIndex + 1}/${totalChunks} (offset=${offset}, limit=${limit})`,
        );

        const orders = await this.ordersRepository.find({
            where: {
                status: OrderStatus.Completed,
                paymentStatus: PaymentStatus.Paid,
                createdAt: Between(new Date(startDate), new Date(endDate)),
            },
            relations: { items: true },
            order: { createdAt: 'ASC', id: 'ASC' },
            skip: offset,
            take: limit,
        });

        if (orders.length === 0) {
            this.logger.log(
                `Chunk ${chunkIndex + 1}: no orders found at offset ${offset}`,
            );
            return { chunkIndex, processed: 0, skipped: true };
        }

        const aggregations = this.aggregateChunk(orders);
        await this.upsertSummaries(aggregations);

        this.logger.log(
            `Chunk ${chunkIndex + 1} complete. Processed ${orders.length} orders, upserted ${aggregations.length} summaries`,
        );

        return {
            chunkIndex,
            processed: orders.length,
            summaries: aggregations.length,
        };
    }

    private aggregateChunk(orders: Order[]) {
        const map = new Map<
            string,
            { totalQuantity: number; totalRevenue: number }
        >();

        for (const order of orders) {
            const dateStr = order.createdAt.toISOString().split('T')[0];

            for (const item of order.items) {
                const key = `${item.productId}::${dateStr}`;
                const existing = map.get(key) ?? {
                    totalQuantity: 0,
                    totalRevenue: 0,
                };

                existing.totalQuantity += item.quantity;
                existing.totalRevenue +=
                    Number(item.priceAtTime) * item.quantity;

                map.set(key, existing);
            }
        }

        const result: Array<{
            productId: string;
            summaryDate: string;
            totalQuantity: number;
            totalRevenue: number;
        }> = [];

        for (const [key, value] of map) {
            const [productId, summaryDate] = key.split('::');
            result.push({ productId, summaryDate, ...value });
        }

        return result;
    }

    private async upsertSummaries(
        aggregations: Array<{
            productId: string;
            summaryDate: string;
            totalQuantity: number;
            totalRevenue: number;
        }>,
    ) {
        for (const agg of aggregations) {
            await this.salesSummaryRepository.upsert(
                {
                    productId: agg.productId,
                    summaryDate: agg.summaryDate,
                    totalQuantity: agg.totalQuantity,
                    totalRevenue: agg.totalRevenue.toString(),
                },
                {
                    conflictPaths: ['productId', 'summaryDate'],
                },
            );
        }
    }
}
