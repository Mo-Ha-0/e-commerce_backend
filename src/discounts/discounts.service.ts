import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Discount } from '../database/entities/discount.entity';
import {
    DiscountAuditLog,
    DiscountAuditAction,
} from '../database/entities/discount-audit-log.entity';
import { CreateDiscountDto } from './dto/create-discount.dto';
import { UpdateDiscountDto } from './dto/update-discount.dto';
import { CacheService } from '../common/cache/cache.service';

const GLOBAL_DISCOUNT_HASH = 'active_discounts:global';

@Injectable()
export class DiscountsService {
    private readonly logger = new Logger(DiscountsService.name);

    constructor(
        @InjectRepository(Discount)
        private readonly discountsRepository: Repository<Discount>,
        @InjectRepository(DiscountAuditLog)
        private readonly auditLogsRepository: Repository<DiscountAuditLog>,
        private readonly cacheService: CacheService,
    ) {}

    async create(dto: CreateDiscountDto) {
        const discount = this.discountsRepository.create({
            ...dto,
            value: dto.value.toFixed(2),
            startDate: dto.startDate ? new Date(dto.startDate) : null,
            endDate: dto.endDate ? new Date(dto.endDate) : null,
        });

        const saved = await this.discountsRepository.save(discount);
        await this.syncCache(saved);

        await this.auditLogsRepository.save({
            discountId: saved.id,
            discountName: saved.name,
            action: DiscountAuditAction.CREATED,
            changes: dto,
            adminId: 'system', // Ideally pass admin ID from controller
        });

        return saved;
    }

    async findAll() {
        return this.discountsRepository.find({ order: { createdAt: 'DESC' } });
    }

    async findOne(id: string) {
        const discount = await this.discountsRepository.findOne({
            where: { id },
        });

        if (!discount) {
            throw new NotFoundException('Discount not found');
        }

        return discount;
    }

    async update(id: string, dto: UpdateDiscountDto) {
        const discount = await this.findOne(id);

        if (dto.name !== undefined) discount.name = dto.name;
        if (dto.type !== undefined) discount.type = dto.type;
        if (dto.value !== undefined) discount.value = dto.value.toFixed(2);
        if (dto.productId !== undefined) discount.productId = dto.productId;
        if (dto.isActive !== undefined) discount.isActive = dto.isActive;
        if (dto.startDate !== undefined)
            discount.startDate = dto.startDate ? new Date(dto.startDate) : null;
        if (dto.endDate !== undefined)
            discount.endDate = dto.endDate ? new Date(dto.endDate) : null;

        const updated = await this.discountsRepository.save(discount);
        await this.syncCache(updated);

        await this.auditLogsRepository.save({
            discountId: updated.id,
            discountName: updated.name,
            action: DiscountAuditAction.UPDATED,
            changes: dto,
            adminId: 'system',
        });

        return updated;
    }

    async remove(id: string) {
        const discount = await this.findOne(id);
        await this.discountsRepository.remove(discount);
        await this.removeCache(discount);

        await this.auditLogsRepository.save({
            discountId: discount.id,
            discountName: discount.name,
            action: DiscountAuditAction.DELETED,
            adminId: 'system',
        });

        return { success: true };
    }

    private async syncCache(discount: Discount) {
        if (!discount.isActive) {
            await this.removeCache(discount);
            return;
        }

        if (discount.productId) {
            await this.cacheService.set(
                `discount:product:${discount.productId}`,
                discount,
                86400, // 24 hours TTL, handled by cron eventually
            );
        } else {
            await this.cacheService.set(
                `discount:global:active`,
                discount,
                86400,
            );
        }
    }

    private async removeCache(discount: Discount) {
        if (discount.productId) {
            await this.cacheService.invalidate(
                `discount:product:${discount.productId}`,
            );
        } else {
            await this.cacheService.invalidate(`discount:global:active`);
        }
    }

    // This method is called by Cron to pre-warm the cache and clean expired discounts
    @Cron(CronExpression.EVERY_HOUR)
    async preWarmCache() {
        this.logger.log('Starting hourly discount cache sweep...');
        const activeDiscounts = await this.discountsRepository.find({
            where: { isActive: true },
        });

        for (const discount of activeDiscounts) {
            const now = new Date();
            const hasStarted = !discount.startDate || discount.startDate <= now;
            const hasEnded = discount.endDate && discount.endDate < now;

            if (hasStarted && !hasEnded) {
                await this.syncCache(discount);
            } else if (hasEnded) {
                discount.isActive = false;
                await this.discountsRepository.save(discount);
                await this.removeCache(discount);
            }
        }
        this.logger.log('Hourly discount cache sweep completed.');
    }
}
