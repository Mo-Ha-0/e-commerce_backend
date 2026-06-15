import { Module } from '@nestjs/common';
import { CartService } from './cart.service';
import { CartController } from './cart.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CartItem } from '../database/entities/cart-item.entity';
import { Product } from '../database/entities/product.entity';
import { InventoryModule } from '../inventory/inventory.module';
import { CacheModule } from '../common/cache/cache.module';

@Module({
    imports: [TypeOrmModule.forFeature([CartItem, Product]), InventoryModule, CacheModule],
    controllers: [CartController],
    providers: [CartService],
    exports: [CartService],
})
export class CartModule {}
