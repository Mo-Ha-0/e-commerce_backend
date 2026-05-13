import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { Queue } from 'bullmq';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { Repository } from 'typeorm';
import { Order, PaymentStatus } from '../database/entities/order.entity';
import {
    DEFAULT_QUEUE_JOB_OPTIONS,
    EMAIL_QUEUE,
    ORDER_CONFIRMATION_JOB,
} from '../queues/queue.constants';
import type { LowStockAlertJobData, OrderJobData } from '../queues/queue.types';

@Injectable()
export class EmailService {
    private readonly logger = new Logger(EmailService.name);
    private transporter?: Transporter;

    constructor(
        @InjectQueue(EMAIL_QUEUE)
        private readonly emailQueue: Queue<OrderJobData>,
        @InjectRepository(Order)
        private readonly ordersRepository: Repository<Order>,
        private readonly configService: ConfigService,
    ) {}

    async enqueueOrderConfirmation(orderId: string) {
        return this.emailQueue.add(
            ORDER_CONFIRMATION_JOB,
            { orderId },
            {
                ...DEFAULT_QUEUE_JOB_OPTIONS,
                jobId: `${ORDER_CONFIRMATION_JOB}-${orderId}`,
            },
        );
    }

    async sendOrderConfirmation(orderId: string) {
        const order = await this.ordersRepository.findOne({
            where: { id: orderId },
            relations: { user: true, items: { product: true } },
        });

        if (!order || order.paymentStatus !== PaymentStatus.Paid) {
            this.logger.warn(
                `Skipping confirmation email for unavailable/unpaid order ${orderId}`,
            );
            return;
        }

        const subject = `Order confirmation ${order.id}`;
        const text = [
            `Hello ${order.user.email},`,
            '',
            `Your order ${order.id} has been paid successfully.`,
            `Total: ${order.totalAmount}`,
            `Paid at: ${order.paidAt?.toISOString() ?? 'N/A'}`,
            '',
            'Items:',
            ...order.items.map(
                (item) =>
                    `- ${item.product?.name ?? item.productId} x ${item.quantity} @ ${item.priceAtTime}`,
            ),
        ].join('\n');

        await this.deliver(order.user.email, subject, text);
    }

    async sendLowStockAlert(data: LowStockAlertJobData) {
        const adminEmail = this.configService.get<string>('ADMIN_ALERT_EMAIL');
        const subject = `Low stock alert: ${data.productName}`;
        const text = [
            `Product ${data.productName} (${data.productId}) is below the configured threshold.`,
            `Current stock: ${data.stock}`,
            `Threshold: ${data.threshold}`,
            `Triggered by order: ${data.orderId}`,
        ].join('\n');

        if (!adminEmail) {
            this.logger.warn(`[LOW STOCK ALERT]\n${text}`);
            return;
        }

        await this.deliver(adminEmail, subject, text);
    }

    private async deliver(to: string, subject: string, text: string) {
        const transporter = this.getTransporter();

        if (!transporter) {
            this.logger.log(
                `[EMAIL LOG FALLBACK] to=${to} subject="${subject}"\n${text}`,
            );
            return;
        }

        await transporter.sendMail({
            from: this.configService.get<string>(
                'SMTP_FROM',
                'no-reply@example.com',
            ),
            to,
            subject,
            text,
        });
    }

    private getTransporter() {
        if (this.transporter) {
            return this.transporter;
        }

        const host = this.configService.get<string>('SMTP_HOST');
        const user = this.configService.get<string>('SMTP_USER');
        const pass = this.configService.get<string>('SMTP_PASS');

        if (!host || !user || !pass) {
            return undefined;
        }

        this.transporter = nodemailer.createTransport({
            host,
            port: Number(this.configService.get<string>('SMTP_PORT', '587')),
            secure:
                this.configService.get<string>('SMTP_SECURE', 'false') ===
                'true',
            auth: { user, pass },
        });

        return this.transporter;
    }
}
