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
