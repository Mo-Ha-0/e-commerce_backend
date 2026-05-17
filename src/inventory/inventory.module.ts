import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../database/entities/order.entity';
import { SalesSummary } from '../database/entities/sales-summary.entity';
import { InventoryLog } from '../database/entities/inventory-log.entity';
import { Product } from '../database/entities/product.entity';
import { MinioModule } from '../minio/minio.module';
import { BATCH_SUMMARY_QUEUE } from '../queues/queue.constants';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { BatchProcessor } from './services/batch.processor';
import { BatchSummaryService } from './services/batch-summary.service';
import { SalesSummaryPdfService } from './services/sales-summary-pdf.service';
import { StockValidationService } from './services/stock-validation.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([Product, InventoryLog, SalesSummary, Order]),
        BullModule.registerQueue({ name: BATCH_SUMMARY_QUEUE }),
        MinioModule,
    ],
    controllers: [InventoryController],
    providers: [
        InventoryService,
        StockValidationService,
        BatchSummaryService,
        BatchProcessor,
        SalesSummaryPdfService,
    ],
    exports: [StockValidationService],
})
export class InventoryModule {}
