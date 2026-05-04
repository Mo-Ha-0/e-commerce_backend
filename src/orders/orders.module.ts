import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
// import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CartItem } from 'src/database/entities/cart-item.entity';
import { OrderItem } from 'src/database/entities/order-item.entity';
import { Order } from 'src/database/entities/order.entity';
import { Product } from 'src/database/entities/product.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([CartItem, Product, Order, OrderItem]),
        // BullModule.registerQueue({ name: INVOICE_QUEUE }),
    ],
    controllers: [OrdersController],
    providers: [OrdersService],
})
export class OrdersModule {}
