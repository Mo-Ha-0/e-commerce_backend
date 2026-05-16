import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Queue } from 'bullmq';
import PDFDocument from 'pdfkit';
import { Readable } from 'stream';
import { Repository } from 'typeorm';
import { Order, PaymentStatus } from '../database/entities/order.entity';
import {
    DEFAULT_QUEUE_JOB_OPTIONS,
    GENERATE_INVOICE_PDF_JOB,
    INVOICE_QUEUE,
} from '../queues/queue.constants';
import type { OrderJobData } from '../queues/queue.types';
import { MinioService } from '../minio/minio.service';

@Injectable()
export class InvoicePdfService {
    private readonly logger = new Logger(InvoicePdfService.name);

    constructor(
        @InjectQueue(INVOICE_QUEUE)
        private readonly invoiceQueue: Queue<OrderJobData>,
        @InjectRepository(Order)
        private readonly ordersRepository: Repository<Order>,
        private readonly minioService: MinioService,
    ) {}

    async enqueueInvoiceGeneration(orderId: string) {
        return this.invoiceQueue.add(
            GENERATE_INVOICE_PDF_JOB,
            { orderId },
            {
                ...DEFAULT_QUEUE_JOB_OPTIONS,
                jobId: `${GENERATE_INVOICE_PDF_JOB}-${orderId}`,
            },
        );
    }

    async generateForOrder(orderId: string) {
        const order = await this.ordersRepository.findOne({
            where: { id: orderId },
            relations: { user: true, items: { product: true } },
        });

        if (!order) {
            throw new NotFoundException('Order not found');
        }

        if (order.paymentStatus !== PaymentStatus.Paid) {
            this.logger.warn(`Skipping invoice for unpaid order ${orderId}`);
            return;
        }

        const key = `invoices/invoice-${order.id}.pdf`;
        const pdfBuffer = await this.generatePdfBuffer(order);

        await this.minioService.uploadFile(key, pdfBuffer, 'application/pdf');

        order.invoicePdfPath = key;
        await this.ordersRepository.save(order);

        return key;
    }

    async getPdfStream(key: string) {
        const response = await this.minioService.getFile(key);
        if (!response.Body) {
            throw new NotFoundException('Invoice PDF not found');
        }
        return {
            stream: response.Body as Readable,
            contentType: response.ContentType ?? 'application/pdf',
        };
    }

    private generatePdfBuffer(order: Order): Promise<Buffer> {
        return new Promise<Buffer>((resolve, reject) => {
            const doc = new PDFDocument({ margin: 50 });
            const chunks: Buffer[] = [];

            doc.on('data', (chunk: Buffer) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            doc.fontSize(20).text('Invoice', { align: 'center' });
            doc.moveDown();
            doc.fontSize(12).text(`Order ID: ${order.id}`);
            doc.text(`Customer: ${order.user.email}`);
            doc.text(`User ID: ${order.userId}`);
            doc.text(`Paid Date: ${order.paidAt?.toISOString() ?? 'N/A'}`);
            doc.moveDown();

            doc.fontSize(14).text('Items');
            doc.moveDown(0.5);

            order.items.forEach((item) => {
                doc.fontSize(11).text(
                    [
                        item.product?.name ?? item.productId,
                        `Quantity: ${item.quantity}`,
                        `Price: ${item.priceAtTime}`,
                        `Line total: ${(
                            Number(item.priceAtTime) * item.quantity
                        ).toFixed(2)}`,
                    ].join(' | '),
                );
            });

            doc.moveDown();
            doc.fontSize(14).text(`Total Amount: ${order.totalAmount}`, {
                align: 'right',
            });
            doc.end();
        });
    }
}
