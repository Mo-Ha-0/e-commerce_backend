import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryLog } from '../database/entities/inventory-log.entity';
import { Product } from '../database/entities/product.entity';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { StockValidationService } from './services/stock-validation.service';

@Module({
    imports: [TypeOrmModule.forFeature([Product, InventoryLog])],
    controllers: [InventoryController],
    providers: [InventoryService, StockValidationService],
    exports: [StockValidationService],
})
export class InventoryModule {}
