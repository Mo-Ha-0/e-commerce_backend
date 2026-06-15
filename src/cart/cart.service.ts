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
import { CacheService } from '../common/cache/cache.service';
import { Discount, DiscountType } from '../database/entities/discount.entity';
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
        private readonly cacheService: CacheService,
    ) {}

    async findCart(userId: string) {
        const cartItems = await this.cartRepository.find({
            where: { userId },
            relations: { product: true },
            order: { updatedAt: 'DESC' },
        });

        if (cartItems.length === 0) {
            return {
                items: [],
                subTotal: 0,
                total: 0,
                globalDiscount: null
            };
        }

        const discountKeys = cartItems.map((item) => `discount:product:${item.product.id}`);
        // Fetch product discounts AND the global discount in one MGET
        discountKeys.push('discount:global:active');
        
        const discounts = await this.cacheService.mget<Discount>(discountKeys);
        const globalDiscount = discounts.pop();

        const now = new Date();
        const isValid = (d: Discount) => {
            if (!d || !d.isActive) return false;
            if (d.startDate && new Date(d.startDate) > now) return false;
            if (d.endDate && new Date(d.endDate) <= now) return false;
            return true;
        };

        const processedItems = cartItems.map((item, index) => {
            const productDiscount = discounts[index];
            const basePrice = Number(item.product.price);
            
            let priceWithProductDiscount = basePrice;
            if (isValid(productDiscount)) {
                if (productDiscount.type === DiscountType.PERCENTAGE) {
                    priceWithProductDiscount = basePrice * (1 - Number(productDiscount.value) / 100);
                } else if (productDiscount.type === DiscountType.FIXED) {
                    priceWithProductDiscount = Math.max(0, basePrice - Number(productDiscount.value));
                }
            }

            let priceWithGlobalDiscount = basePrice;
            if (isValid(globalDiscount)) {
                if (globalDiscount.type === DiscountType.PERCENTAGE) {
                    priceWithGlobalDiscount = basePrice * (1 - Number(globalDiscount.value) / 100);
                } else if (globalDiscount.type === DiscountType.FIXED) {
                    priceWithGlobalDiscount = Math.max(0, basePrice - Number(globalDiscount.value));
                }
            }

            let finalPrice = basePrice;
            let appliedDiscount = null;

            if (priceWithProductDiscount < basePrice || priceWithGlobalDiscount < basePrice) {
                if (priceWithProductDiscount <= priceWithGlobalDiscount) {
                    finalPrice = priceWithProductDiscount;
                    appliedDiscount = {
                        id: productDiscount.id,
                        name: productDiscount.name,
                        type: productDiscount.type,
                        value: Number(productDiscount.value),
                    };
                } else {
                    finalPrice = priceWithGlobalDiscount;
                    appliedDiscount = {
                        id: globalDiscount.id,
                        name: globalDiscount.name,
                        type: globalDiscount.type,
                        value: Number(globalDiscount.value),
                    };
                }
            }

            return {
                ...item,
                product: {
                    ...item.product,
                    originalPrice: basePrice,
                    price: finalPrice.toFixed(2),
                    discount: appliedDiscount,
                }
            };
        });

        let subTotal = 0;
        let finalTotal = 0;
        processedItems.forEach(item => {
            subTotal += item.product.originalPrice * item.quantity;
            finalTotal += Number(item.product.price) * item.quantity;
        });

        return {
            items: processedItems,
            subTotal: Number(subTotal.toFixed(2)),
            total: Number(finalTotal.toFixed(2)),
        };
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
