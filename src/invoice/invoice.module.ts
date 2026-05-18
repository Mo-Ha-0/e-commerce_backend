import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../database/entities/order.entity';
import { INVOICE_QUEUE } from '../queues/queue.constants';
import { MinioModule } from '../minio/minio.module';
import { InvoicePdfService } from './invoice-pdf.service';
import { InvoiceProcessor } from './invoice.processor';

@Module({
    imports: [
        BullModule.registerQueue({ name: INVOICE_QUEUE }),
        TypeOrmModule.forFeature([Order]),
        MinioModule,
    ],
    providers: [InvoicePdfService, InvoiceProcessor],
    exports: [InvoicePdfService],
})
export class InvoiceModule {}
