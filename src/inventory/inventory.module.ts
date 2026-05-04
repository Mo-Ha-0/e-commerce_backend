import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryLog } from '../database/entities/inventory-log.entity';
import { Product } from '../database/entities/product.entity';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
    imports: [TypeOrmModule.forFeature([Product, InventoryLog])],
    controllers: [InventoryController],
    providers: [InventoryService],
})
export class InventoryModule {}
