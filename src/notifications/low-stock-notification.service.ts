import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { Product } from '../database/entities/product.entity';
import {
    DEFAULT_QUEUE_JOB_OPTIONS,
    LOW_STOCK_ALERT_JOB,
    LOW_STOCK_QUEUE,
} from '../queues/queue.constants';
import type { LowStockAlertJobData } from '../queues/queue.types';

@Injectable()
export class LowStockNotificationService {
    constructor(
        @InjectQueue(LOW_STOCK_QUEUE)
        private readonly lowStockQueue: Queue<LowStockAlertJobData>,
        private readonly configService: ConfigService,
    ) {}

    async enqueueLowStockAlerts(orderId: string, products: Product[]) {
        const threshold = Number(
            this.configService.get<string>('LOW_STOCK_THRESHOLD', '5'),
        );

        const lowStockProducts = products.filter(
            (product) => product.stock <= threshold,
        );

        return Promise.all(
            lowStockProducts.map((product) =>
                this.lowStockQueue.add(
                    LOW_STOCK_ALERT_JOB,
                    {
                        orderId,
                        productId: product.id,
                        productName: product.name,
                        stock: product.stock,
                        threshold,
                    },
                    {
                        ...DEFAULT_QUEUE_JOB_OPTIONS,
                        jobId: `${LOW_STOCK_ALERT_JOB}-${orderId}-${product.id}`,
                    },
                ),
            ),
        );
    }
}
