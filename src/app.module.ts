import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { User } from './database/entities/user.entity';
import { CartItem } from './database/entities/cart-item.entity';
import { InventoryLog } from './database/entities/inventory-log.entity';
import { OrderItem } from './database/entities/order-item.entity';
import { Order } from './database/entities/order.entity';
import { Product } from './database/entities/product.entity';
import { SalesSummary } from './database/entities/sales-summary.entity';
import { WalletTransaction } from './database/entities/wallet-transaction.entity';
import { UsersModule } from './users/users.module';
import { ProductsModule } from './products/products.module';
import { CartModule } from './cart/cart.module';
import { OrdersModule } from './orders/orders.module';
import { InventoryModule } from './inventory/inventory.module';
import { WalletModule } from './wallet/wallet.module';
import { HealthModule } from './health/health.module';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        ThrottlerModule.forRoot([
            {
                ttl: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60000),
                limit: Number(process.env.RATE_LIMIT_MAX ?? 5),
            },
        ]),
        ScheduleModule.forRoot(),
        BullModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
                connection: {
                    host: config.get<string>('REDIS_HOST', 'localhost'),
                    port: Number(config.get<string>('REDIS_PORT', '6379')),
                },
            }),
        }),
        TypeOrmModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
                type: 'postgres',
                host: config.get<string>('DB_HOST', 'localhost'),
                port: Number(config.get<string>('DB_PORT', '5432')),
                username: config.get<string>('DB_USER', 'admin'),
                password: config.get<string>('DB_PASS', 'password'),
                database: config.get<string>('DB_NAME', 'ecommerce_first_five'),
                entities: [
                    User,
                    Product,
                    CartItem,
                    Order,
                    OrderItem,
                    InventoryLog,
                    SalesSummary,
                    WalletTransaction,
                ],
                synchronize:
                    config.get<string>('TYPEORM_SYNC', 'true') === 'true',
                extra: {
                    max: Number(config.get<string>('DB_POOL_MAX', '10')),
                },
            }),
        }),
        AuthModule,
        UsersModule,
        ProductsModule,
        CartModule,
        OrdersModule,
        InventoryModule,
        WalletModule,
        HealthModule,
    ],
    providers: [
        {
            provide: APP_GUARD,
            useClass: ThrottlerGuard,
        },
    ],
})
export class AppModule {}
