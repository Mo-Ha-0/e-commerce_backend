import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CartItem } from '../database/entities/cart-item.entity';
import { Product } from '../database/entities/product.entity';
import { StockValidationService } from '../inventory/services/stock-validation.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

@Injectable()
export class CartService {
    private readonly maxCartItems = 50;

    constructor(
        @InjectRepository(CartItem)
        private readonly cartRepository: Repository<CartItem>,
        @InjectRepository(Product)
        private readonly productsRepository: Repository<Product>,
        private readonly stockValidationService: StockValidationService,
    ) {}

    findCart(userId: string) {
        return this.cartRepository.find({
            where: { userId },
            relations: { product: true },
            order: { updatedAt: 'DESC' },
        });
    }

    async addItem(userId: string, dto: AddCartItemDto) {
        const product = await this.productsRepository.findOne({
            where: { id: dto.productId },
        });

        if (!product) {
            throw new NotFoundException('Product not found');
        }

        let cartItem = await this.cartRepository.findOne({
            where: { userId, productId: dto.productId },
        });

        const requestedQuantity = (cartItem?.quantity ?? 0) + dto.quantity;
        await this.stockValidationService.validateProductStock(
            dto.productId,
            requestedQuantity,
        );

        if (!cartItem) {
            const count = await this.cartRepository.count({
                where: { userId },
            });

            if (count >= this.maxCartItems) {
                throw new BadRequestException('Cart item limit exceeded');
            }

            cartItem = this.cartRepository.create({
                userId,
                productId: dto.productId,
                quantity: dto.quantity,
            });
        } else {
            cartItem.quantity += dto.quantity;
        }

        await this.cartRepository.save(cartItem);
        return this.findCart(userId);
    }

    async updateItem(
        userId: string,
        productId: string,
        dto: UpdateCartItemDto,
    ) {
        const item = await this.cartRepository.findOne({
            where: { userId, productId },
        });

        if (!item) {
            throw new NotFoundException('Cart item not found');
        }

        const product = await this.productsRepository.findOne({
            where: { id: productId },
        });

        if (!product) {
            throw new NotFoundException('Product not found');
        }

        await this.stockValidationService.validateProductStock(
            productId,
            dto.quantity,
        );

        item.quantity = dto.quantity;
        await this.cartRepository.save(item);
        return this.findCart(userId);
    }

    async removeItem(userId: string, productId: string) {
        await this.cartRepository.delete({ userId, productId });
        return this.findCart(userId);
    }

    async clear(userId: string) {
        await this.cartRepository.delete({ userId });
        return [];
    }
}
