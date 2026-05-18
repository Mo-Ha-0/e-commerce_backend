import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { EMAIL_QUEUE, ORDER_CONFIRMATION_JOB } from '../queues/queue.constants';
import type { OrderJobData } from '../queues/queue.types';
import { EmailService } from './email.service';

@Processor(EMAIL_QUEUE, {
    concurrency: Number(process.env.EMAIL_QUEUE_CONCURRENCY ?? 5),
})
export class EmailProcessor extends WorkerHost {
    private readonly logger = new Logger(EmailProcessor.name);

    constructor(private readonly emailService: EmailService) {
        super();
    }

    async process(job: Job<OrderJobData>) {
        if (job.name !== ORDER_CONFIRMATION_JOB) {
            this.logger.warn(`Ignoring unknown email job ${job.name}`);
            return;
        }

        await this.emailService.sendOrderConfirmation(job.data.orderId);
    }
}
