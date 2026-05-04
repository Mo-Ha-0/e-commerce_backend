import { Module } from '@nestjs/common';
import { CartService } from './cart.service';
import { CartController } from './cart.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CartItem } from 'src/database/entities/cart-item.entity';
import { Product } from 'src/database/entities/product.entity';

@Module({
    imports: [TypeOrmModule.forFeature([CartItem, Product])],
    controllers: [CartController],
    providers: [CartService],
    exports: [CartService],
})
export class CartModule {}
