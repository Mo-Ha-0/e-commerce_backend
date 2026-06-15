import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CartItem } from 'src/database/entities/cart-item.entity';
import { OrderItem } from 'src/database/entities/order-item.entity';
import { Order } from 'src/database/entities/order.entity';
import { Product } from 'src/database/entities/product.entity';
import { User } from 'src/database/entities/user.entity';
import { WalletTransaction } from 'src/database/entities/wallet-transaction.entity';
import { EmailModule } from '../email/email.module';
import { InventoryModule } from '../inventory/inventory.module';
import { InvoiceModule } from '../invoice/invoice.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CheckoutFacade } from './facades/checkout.facade';
import { CacheModule } from '../common/cache/cache.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            CartItem,
            Product,
            Order,
            OrderItem,
            User,
            WalletTransaction,
        ]),
        EmailModule,
        InventoryModule,
        InvoiceModule,
        NotificationsModule,
        CacheModule,
    ],
    controllers: [OrdersController],
    providers: [OrdersService, CheckoutFacade],
})
export class OrdersModule {}
