import type { JobsOptions } from 'bullmq';

export const EMAIL_QUEUE = 'email';
export const INVOICE_QUEUE = 'invoice';
export const LOW_STOCK_QUEUE = 'low-stock';

export const ORDER_CONFIRMATION_JOB = 'order-confirmation';
export const GENERATE_INVOICE_PDF_JOB = 'generate-invoice-pdf';
export const LOW_STOCK_ALERT_JOB = 'low-stock-alert';

export const DEFAULT_QUEUE_JOB_OPTIONS: JobsOptions = {
    attempts: 3,
    backoff: {
        type: 'exponential',
        delay: 1000,
    },
    removeOnComplete: 100,
    removeOnFail: 200,
};
