import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import {
    BATCH_SUMMARY_QUEUE,
    PROCESS_BATCH_SUMMARY_JOB,
} from '../../queues/queue.constants';
import type { BatchSummaryJobData } from '../../queues/queue.types';
import { BatchSummaryService } from './batch-summary.service';
import { SalesSummaryPdfService } from './sales-summary-pdf.service';

@Processor(BATCH_SUMMARY_QUEUE, {
    concurrency: 3,
})
export class BatchProcessor extends WorkerHost {
    private readonly logger = new Logger(BatchProcessor.name);
    private completedChunks = new Map<string, number>();
    private pdfGenerationLock = new Set<string>();

    constructor(
        private readonly batchSummaryService: BatchSummaryService,
        private readonly salesSummaryPdfService: SalesSummaryPdfService,
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
        const periodLabel = jobData.periodLabel;
        const lockKey = periodLabel;

        if (this.pdfGenerationLock.has(lockKey)) {
            this.logger.log(
                `PDF already generated for ${periodLabel}, skipping`,
            );
            return;
        }

        const current = this.completedChunks.get(lockKey) ?? 0;
        this.completedChunks.set(lockKey, current + 1);
        const totalDone = current + 1;

        this.logger.log(
            `Chunk ${jobData.chunkIndex + 1} done. ${totalDone}/${jobData.totalChunks} chunks completed for ${periodLabel}`,
        );

        if (totalDone >= jobData.totalChunks) {
            this.pdfGenerationLock.add(lockKey);

            this.logger.log(
                `All ${jobData.totalChunks} chunks completed for ${periodLabel}. Generating monthly PDF...`,
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
                this.pdfGenerationLock.delete(lockKey);
                this.logger.error(
                    `Failed to generate monthly PDF: ${err.message}`,
                );
            }
        }
    }
}
