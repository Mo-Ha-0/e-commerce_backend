import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { DistributedLockService } from '../../common/distributed-lock.service';
import { FailedJob } from '../../database/entities/failed-job.entity';
import { EmailService } from '../../email/email.service';
import { InvoicePdfService } from '../../invoice/invoice-pdf.service';

const MAX_RETRIES = 5;
const BATCH_SIZE = 50;
const CRON_LOCK_KEY = 'cron:failed-job-retry';
const CRON_LOCK_TTL_MS = 240_000;

@Injectable()
export class FailedJobRetryService {
    private readonly logger = new Logger(FailedJobRetryService.name);

    constructor(
        @InjectRepository(FailedJob)
        private readonly failedJobsRepository: Repository<FailedJob>,
        private readonly emailService: EmailService,
        private readonly invoicePdfService: InvoicePdfService,
        private readonly distributedLock: DistributedLockService,
    ) {}

    @Cron(CronExpression.EVERY_5_MINUTES)
    async retryFailedJobs() {
        const token = await this.distributedLock.acquire(
            CRON_LOCK_KEY,
            CRON_LOCK_TTL_MS,
        );
        if (!token) {
            this.logger.log(
                'Another instance holds the failed-job-retry lock, skipping',
            );
            return;
        }

        try {
            const failed = await this.failedJobsRepository.find({
                where: {
                    pendingRetry: true,
                    retryCount: LessThan(MAX_RETRIES),
                },
                take: BATCH_SIZE,
                order: { createdAt: 'ASC' },
            });

            if (failed.length === 0) return;

            this.logger.log(
                `Retrying ${failed.length} failed post-checkout jobs`,
            );

            for (const job of failed) {
                await this.retry(job);
            }
        } finally {
            await this.distributedLock.release(CRON_LOCK_KEY, token);
        }
    }

    private async retry(job: FailedJob) {
        try {
            await this.executeRetry(job);
            job.pendingRetry = false;
            this.logger.log(
                `Retry succeeded for ${job.jobType} (order ${job.orderId})`,
            );
        } catch (err) {
            job.retryCount++;
            const errorMessage =
                err instanceof Error ? err.message : String(err);
            this.logger.error(
                `Retry ${job.retryCount}/${MAX_RETRIES} failed for ${job.jobType} (order ${job.orderId}): ${errorMessage}`,
            );
            if (job.retryCount >= MAX_RETRIES) {
                job.pendingRetry = false;
                job.error = `Gave up after ${MAX_RETRIES} retries. Last error: ${errorMessage}`;
            }
        }

        await this.failedJobsRepository.save(job);
    }

    private executeRetry(job: FailedJob): Promise<unknown> {
        switch (job.jobType) {
            case 'email:order-confirmation':
                return this.emailService.enqueueOrderConfirmation(job.orderId);
            case 'invoice:generation':
                return this.invoicePdfService.enqueueInvoiceGeneration(
                    job.orderId,
                );
            default:
                this.logger.warn(
                    `Unknown job type "${job.jobType}" for order ${job.orderId}, skipping retry`,
                );
                return Promise.resolve();
        }
    }
}
