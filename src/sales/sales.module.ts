import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalesService } from './sales.service';
import { Order } from '../database/entities/order.entity';
import { OrderItem } from '../database/entities/order-item.entity';
import { SalesSummary } from '../database/entities/sales-summary.entity';
import { JobLog } from '../database/entities/job-log.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([Order, OrderItem, SalesSummary, JobLog]),
    ],
    providers: [SalesService],
    exports: [SalesService],
})
export class SalesModule {}
