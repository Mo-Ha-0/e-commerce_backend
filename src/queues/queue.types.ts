export interface OrderJobData {
    orderId: string;
}

export interface LowStockAlertJobData {
    orderId: string;
    productId: string;
    productName: string;
    stock: number;
    threshold: number;
}

export interface BatchSummaryJobData {
    offset: number;
    limit: number;
    chunkIndex: number;
    totalChunks: number;
    startDate: string;
    endDate: string;
    periodLabel: string;
}
