import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Discount } from '../database/entities/discount.entity';
import { DiscountAuditLog } from '../database/entities/discount-audit-log.entity';
import { DiscountsService } from './discounts.service';
import { DiscountsController } from './discounts.controller';
import { CacheModule } from '../common/cache/cache.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([Discount, DiscountAuditLog]),
        CacheModule,
    ],
    controllers: [DiscountsController],
    providers: [DiscountsService],
    exports: [DiscountsService],
})
export class DiscountsModule {}
