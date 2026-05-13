import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import {
    GENERATE_INVOICE_PDF_JOB,
    INVOICE_QUEUE,
} from '../queues/queue.constants';
import type { OrderJobData } from '../queues/queue.types';
import { InvoicePdfService } from './invoice-pdf.service';

@Processor(INVOICE_QUEUE, {
    concurrency: Number(process.env.INVOICE_QUEUE_CONCURRENCY ?? 3),
})
export class InvoiceProcessor extends WorkerHost {
    private readonly logger = new Logger(InvoiceProcessor.name);

    constructor(private readonly invoicePdfService: InvoicePdfService) {
        super();
    }

    async process(job: Job<OrderJobData>) {
        if (job.name !== GENERATE_INVOICE_PDF_JOB) {
            this.logger.warn(`Ignoring unknown invoice job ${job.name}`);
            return;
        }

        await this.invoicePdfService.generateForOrder(job.data.orderId);
    }
}
