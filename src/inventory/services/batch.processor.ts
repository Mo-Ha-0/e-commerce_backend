import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import {
    BATCH_SUMMARY_QUEUE,
    PROCESS_BATCH_SUMMARY_JOB,
} from '../../queues/queue.constants';
import type { BatchSummaryJobData } from '../../queues/queue.types';
import { DistributedLockService } from '../../common/distributed-lock.service';
import { BatchSummaryService } from './batch-summary.service';
import { SalesSummaryPdfService } from './sales-summary-pdf.service';

const CHUNK_COUNTER_TTL_MS = 60 * 60 * 1000;
const PDF_LOCK_TTL_MS = 10 * 60 * 1000;

@Processor(BATCH_SUMMARY_QUEUE, {
    concurrency: 3,
})
export class BatchProcessor extends WorkerHost {
    private readonly logger = new Logger(BatchProcessor.name);

    constructor(
        private readonly batchSummaryService: BatchSummaryService,
        private readonly salesSummaryPdfService: SalesSummaryPdfService,
        private readonly distributedLock: DistributedLockService,
    ) {
        super();
    }

    async process(job: Job<BatchSummaryJobData>) {
        if (job.name !== PROCESS_BATCH_SUMMARY_JOB) {
            this.logger.warn(`Ignoring unknown batch job: ${job.name}`);
            return;
        }

        this.logger.log(
            `Worker picked up chunk job ${job.id} — chunk ${job.data.chunkIndex + 1}/${job.data.totalChunks}`,
        );

        const result = await this.batchSummaryService.processChunk(job.data);

        this.logger.log(
            `Chunk job ${job.id} finished: ${JSON.stringify(result)}`,
        );

        await this.checkAndGeneratePdf(job.data);

        return result;
    }

    private async checkAndGeneratePdf(jobData: BatchSummaryJobData) {
        const { periodLabel, totalChunks } = jobData;

        const counterKey = `batch-chunks-done:${periodLabel}`;
        const totalDone = await this.distributedLock.increment(
            counterKey,
            CHUNK_COUNTER_TTL_MS,
        );

        this.logger.log(
            `Chunk ${jobData.chunkIndex + 1} done. ${totalDone}/${totalChunks} chunks completed for ${periodLabel}`,
        );

        if (totalDone < totalChunks) {
            return;
        }

        const pdfLockKey = `batch-pdf-lock:${periodLabel}`;
        const acquired = await this.distributedLock.acquire(
            pdfLockKey,
            PDF_LOCK_TTL_MS,
        );

        if (!acquired) {
            this.logger.log(
                `PDF generation already claimed by another instance for ${periodLabel}, skipping`,
            );
            return;
        }

        this.logger.log(
            `All ${totalChunks} chunks completed for ${periodLabel}. Generating monthly PDF...`,
        );

        try {
            const [year, month] = periodLabel.split('-').map(Number);
            const key =
                await this.salesSummaryPdfService.generateAndUploadForMonth(
                    year,
                    month,
                );

            if (key) {
                this.logger.log(`Monthly PDF generated: ${key}`);
            } else {
                this.logger.warn(
                    `No summaries found for ${periodLabel}, PDF skipped`,
                );
            }
        } catch (err) {
            await this.distributedLock.release(pdfLockKey);
            this.logger.error(
                `Failed to generate monthly PDF for ${periodLabel}: ${err instanceof Error ? err.message : String(err)}`,
            );
        }
    }
}
