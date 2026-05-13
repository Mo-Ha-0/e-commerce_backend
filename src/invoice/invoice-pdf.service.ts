import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { Queue } from 'bullmq';
import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import { join } from 'path';
import PDFDocument from 'pdfkit';
import { Repository } from 'typeorm';
import { Order, PaymentStatus } from '../database/entities/order.entity';
import {
    DEFAULT_QUEUE_JOB_OPTIONS,
    GENERATE_INVOICE_PDF_JOB,
    INVOICE_QUEUE,
} from '../queues/queue.constants';
import type { OrderJobData } from '../queues/queue.types';

@Injectable()
export class InvoicePdfService {
    private readonly logger = new Logger(InvoicePdfService.name);

    constructor(
        @InjectQueue(INVOICE_QUEUE)
        private readonly invoiceQueue: Queue<OrderJobData>,
        @InjectRepository(Order)
        private readonly ordersRepository: Repository<Order>,
        private readonly configService: ConfigService,
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

        const storageDir = this.configService.get<string>(
            'INVOICE_STORAGE_DIR',
            'storage/invoices',
        );
        await mkdir(storageDir, { recursive: true });

        const filePath = join(storageDir, `invoice-${order.id}.pdf`);
        await this.writePdf(filePath, order);

        order.invoicePdfPath = filePath;
        await this.ordersRepository.save(order);

        return filePath;
    }

    private writePdf(filePath: string, order: Order) {
        return new Promise<void>((resolve, reject) => {
            const doc = new PDFDocument({ margin: 50 });
            const stream = createWriteStream(filePath);

            stream.on('finish', resolve);
            stream.on('error', reject);
            doc.on('error', reject);

            doc.pipe(stream);
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
