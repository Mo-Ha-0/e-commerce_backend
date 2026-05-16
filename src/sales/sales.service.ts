import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Order, OrderStatus } from '../database/entities/order.entity';
import { OrderItem } from '../database/entities/order-item.entity';
import { SalesSummary } from '../database/entities/sales-summary.entity';
import { JobLog } from '../database/entities/job-log.entity';

@Injectable()
export class SalesService {
    private readonly logger = new Logger(SalesService.name);
    private readonly CHUNK = 100;

    constructor(
        @InjectRepository(Order)
        private readonly ordersRepo: Repository<Order>,
        @InjectRepository(OrderItem)
        private readonly orderItemsRepo: Repository<OrderItem>,
        @InjectRepository(SalesSummary)
        private readonly salesRepo: Repository<SalesSummary>,
        @InjectRepository(JobLog)
        private readonly jobLogRepo: Repository<JobLog>,
        private readonly dataSource: DataSource,
    ) {}

    // run daily at 02:00
    @Cron('0 0 2 * * *')
    // @Cron(CronExpression.EVERY_MINUTE)
    async handleDailySalesJob() {
        const job = this.jobLogRepo.create({
            jobName: 'daily_sales_summary',
            startAt: new Date(),
            processedCount: 0,
        });

        const savedJob = await this.jobLogRepo.save(job);
        this.logger.log(`Started daily_sales_summary job id=${savedJob.id}`);

        const conn = this.dataSource.createQueryRunner();
        await conn.connect();

        try {
            // We'll process orders created today with status Completed
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            const dateStr = `${yyyy}-${mm}-${dd}`; // YYYY-MM-DD

            let offset = 0;
            let processed = 0;

            // Use server-local timezone boundaries for "today"
            // Construct Date with local components so the resulting ISO string
            // represents the correct UTC instant for the server's local day start/end.
            const startOfDay = new Date(
                yyyy,
                Number(mm) - 1,
                Number(dd),
                0,
                0,
                0,
                0,
            );
            const endOfDay = new Date(
                yyyy,
                Number(mm) - 1,
                Number(dd),
                23,
                59,
                59,
                999,
            );

            while (true) {
                const orders = await conn.manager
                    .createQueryBuilder(Order, 'o')
                    .leftJoinAndSelect('o.items', 'item')
                    .where('o.status = :status', { status: OrderStatus.Completed })
                    .andWhere('o.createdAt >= :start AND o.createdAt <= :end', {
                        start: startOfDay.toISOString(),
                        end: endOfDay.toISOString(),
                    })
                    .orderBy('o.createdAt', 'ASC')
                    .skip(offset)
                    .take(this.CHUNK)
                    .getMany();

                if (!orders || orders.length === 0) break;

                // aggregate per product for this batch
                const agg = new Map<string, { quantity: number; revenue: number }>();

                for (const order of orders) {
                    for (const item of order.items) {
                        const q = agg.get(item.productId) ?? { quantity: 0, revenue: 0 };
                        q.quantity += item.quantity;
                        q.revenue += Number(item.priceAtTime) * item.quantity;
                        agg.set(item.productId, q);
                    }
                }

                // upsert summaries inside a transaction
                await conn.startTransaction();
                try {
                    for (const [productId, { quantity, revenue }] of agg.entries()) {
                        const existing = await conn.manager.findOne(SalesSummary, {
                            where: { productId, summaryDate: dateStr },
                        });

                        if (existing) {
                            existing.totalQuantity += quantity;
                            existing.totalRevenue = (
                                Number(existing.totalRevenue) + revenue
                            ).toFixed(2);
                            await conn.manager.save(existing);
                        } else {
                            const s = this.salesRepo.create({
                                productId,
                                summaryDate: dateStr,
                                totalQuantity: quantity,
                                totalRevenue: revenue.toFixed(2),
                            });
                            await conn.manager.save(s);
                        }
                    }

                    await conn.commitTransaction();
                } catch (err) {
                    await conn.rollbackTransaction();
                    throw err;
                }

                processed += orders.length;
                offset += orders.length;
            }

            savedJob.processedCount = processed;
            savedJob.endAt = new Date();
            await this.jobLogRepo.save(savedJob);

            this.logger.log(`Completed daily_sales_summary processed=${processed}`);
        } catch (err) {
            this.logger.error('daily_sales_summary failed', err as any);
            savedJob.details = (err as any)?.message || String(err);
            savedJob.endAt = new Date();
            await this.jobLogRepo.save(savedJob);
        } finally {
            await conn.release();
        }
    }
}
