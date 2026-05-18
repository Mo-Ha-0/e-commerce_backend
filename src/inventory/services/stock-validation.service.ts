import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { CartItem } from '../../database/entities/cart-item.entity';
import { Product } from '../../database/entities/product.entity';

export interface LockedStockItem {
    product: Product;
    quantity: number;
    newStock: number;
}

@Injectable()
export class StockValidationService {
    constructor(
        @InjectRepository(Product)
        private readonly productsRepository: Repository<Product>,
    ) {}

    async validateProductStock(productId: string, quantity: number) {
        const product = await this.productsRepository.findOne({
            where: { id: productId },
        });

        return this.validateLoadedProduct(product, quantity);
    }

    async validateCheckoutItems(
        manager: EntityManager,
        cartItems: CartItem[],
    ): Promise<LockedStockItem[]> {
        const quantitiesByProduct = new Map<string, number>();

        for (const item of cartItems) {
            quantitiesByProduct.set(
                item.productId,
                (quantitiesByProduct.get(item.productId) ?? 0) + item.quantity,
            );
        }

        const sortedItems = [...quantitiesByProduct.entries()].sort(
            ([a], [b]) => a.localeCompare(b),
        );

        const lockedItems: LockedStockItem[] = [];

        for (const [productId, quantity] of sortedItems) {
            const product = await manager.getRepository(Product).findOne({
                where: { id: productId },
                lock: { mode: 'pessimistic_write' },
            });

            this.validateLoadedProduct(product, quantity);

            lockedItems.push({
                product: product as Product,
                quantity,
                newStock: (product as Product).stock - quantity,
            });
        }

        return lockedItems;
    }

    private validateLoadedProduct(product: Product | null, quantity: number) {
        if (!product) {
            throw new NotFoundException('Product not found');
        }

        if (quantity <= 0) {
            throw new BadRequestException('Quantity must be greater than zero');
        }

        if (product.stock < quantity) {
            throw new BadRequestException('Insufficient product stock');
        }

        return product;
    }
}
