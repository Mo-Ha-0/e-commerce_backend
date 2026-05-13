import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import {
    LOW_STOCK_ALERT_JOB,
    LOW_STOCK_QUEUE,
} from '../queues/queue.constants';
import type { LowStockAlertJobData } from '../queues/queue.types';
import { EmailService } from '../email/email.service';

@Processor(LOW_STOCK_QUEUE, {
    concurrency: Number(process.env.LOW_STOCK_QUEUE_CONCURRENCY ?? 5),
})
export class LowStockProcessor extends WorkerHost {
    private readonly logger = new Logger(LowStockProcessor.name);

    constructor(private readonly emailService: EmailService) {
        super();
    }

    async process(job: Job<LowStockAlertJobData>) {
        if (job.name !== LOW_STOCK_ALERT_JOB) {
            this.logger.warn(`Ignoring unknown low-stock job ${job.name}`);
            return;
        }

        await this.emailService.sendLowStockAlert(job.data);
    }
}
