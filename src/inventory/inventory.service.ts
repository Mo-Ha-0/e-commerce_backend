import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { InventoryLog } from '../database/entities/inventory-log.entity';
import { Product } from '../database/entities/product.entity';
import { RestockDto } from './dto/restock.dto';
import { UpdateStockDto } from './dto/update-stock.dto';

@Injectable()
export class InventoryService {
    constructor(
        @InjectRepository(Product)
        private readonly productsRepository: Repository<Product>,
        @InjectRepository(InventoryLog)
        private readonly logsRepository: Repository<InventoryLog>,
    ) {}

    async updateStock(productId: string, adminId: string, dto: UpdateStockDto) {
        const product = await this.findProduct(productId);
        const previousStock = product.stock;

        product.stock = dto.stock;
        const saved = await this.productsRepository.save(product);

        await this.logsRepository.save({
            productId,
            adminId,
            previousStock,
            newStock: dto.stock,
            change: dto.stock - previousStock,
            reason: dto.reason ?? 'manual-update',
        });

        return saved;
    }

    async restock(productId: string, adminId: string, dto: RestockDto) {
        const product = await this.findProduct(productId);
        const previousStock = product.stock;
        const newStock = product.stock + dto.quantity;

        product.stock = newStock;
        const saved = await this.productsRepository.save(product);

        await this.logsRepository.save({
            productId,
            adminId,
            previousStock,
            newStock,
            change: dto.quantity,
            reason: dto.reason ?? 'restock',
        });

        return saved;
    }

    findLowStock(threshold = 5) {
        return this.productsRepository.find({
            where: { stock: LessThanOrEqual(threshold) },
            order: { stock: 'ASC' },
        });
    }

    findLogs() {
        const logs = this.logsRepository.find({
            relations: { product: true, admin: true },
            order: { createdAt: 'DESC' },
            take: 200,
        });

        const filteredLogs = (async () => {
            const resolvedLogs = await logs;
            return resolvedLogs.map((log) => {
                const { passwordHash, ...adminWithoutPassword } =
                    log.admin || {};
                return {
                    ...log,
                    admin: adminWithoutPassword,
                };
            });
        })();

        return filteredLogs;
    }

    private async findProduct(productId: string) {
        const product = await this.productsRepository.findOne({
            where: { id: productId },
        });

        if (!product) {
            throw new NotFoundException('Product not found');
        }

        return product;
    }
}
