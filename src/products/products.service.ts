import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Product } from '../database/entities/product.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CacheService } from '../common/cache/cache.service';
import { Discount, DiscountType } from '../database/entities/discount.entity';

const PRODUCT_CACHE_TTL = 3600;
const PRODUCT_LIST_CACHE_TTL = 300;

const CACHE_KEY_PRODUCT_LIST = (page: number, limit: number) =>
    `products:list:${page}:${limit}`;

@Injectable()
export class ProductsService {
    constructor(
        @InjectRepository(Product)
        private readonly productsRepository: Repository<Product>,
        private readonly cacheService: CacheService,
    ) {}

    async create(dto: CreateProductDto) {
        const product = await this.productsRepository.save(
            this.productsRepository.create({
                name: dto.name,
                description: dto.description ?? '',
                price: dto.price.toFixed(2),
                stock: dto.stock,
            }),
        );

        await this.cacheService.invalidatePattern('products:list:*');

        const [productWithDiscount] = await this.applyDiscounts([product]);
        return productWithDiscount;
    }

    async findAll(page = 1, limit = 20) {
        const safePage = Math.max(page, 1);
        const safeLimit = Math.min(Math.max(limit, 1), 1000);

        const cacheKey = CACHE_KEY_PRODUCT_LIST(safePage, safeLimit);

        const cached =
            await this.cacheService.get<[Omit<Product, 'stock'>[], number]>(
                cacheKey,
            );
        if (cached) {
            const [items, total] = cached;
            if (items.length === 0) {
                return [items, total] as [Product[], number];
            }
            const ids = items.map((item) => item.id);

            const stockRows = await this.productsRepository.find({
                where: { id: In(ids) },
                select: ['id', 'stock'],
            });

            const stockMap = new Map<string, number>(
                stockRows.map((p) => [p.id, p.stock]),
            );

            const itemsWithStock = items.map((item) => ({
                ...item,
                stock: stockMap.get(item.id) ?? 0,
            })) as Product[];

            return [await this.applyDiscounts(itemsWithStock), total] as [
                Product[],
                number,
            ];
        }

        const result = await this.productsRepository.findAndCount({
            order: { createdAt: 'DESC' },
            skip: (safePage - 1) * safeLimit,
            take: safeLimit,
        });

        const [items, total] = result;
        const itemsWithoutStock = items.map(
            ({ stock: _stock, ...rest }) => rest,
        );

        await this.cacheService.set(
            cacheKey,
            [itemsWithoutStock, total],
            PRODUCT_LIST_CACHE_TTL,
        );

        return [await this.applyDiscounts(items as Product[]), total] as [
            Product[],
            number,
        ];
    }

    async findOne(id: string) {
        if (id.length !== 36 || !/^[0-9a-fA-F-]+$/.test(id)) {
            throw new NotFoundException('Invalid ID format');
        }

        const cacheKey = `product:${id}`;

        const cached = await this.cacheService.get<Product>(cacheKey);
        if (cached) {
            const stockResult = await this.productsRepository.findOne({
                where: { id },
                select: ['stock'],
            });
            if (!stockResult) {
                await this.cacheService.invalidate(cacheKey);
                throw new NotFoundException('Product not found');
            }
            const productWithStock = {
                ...cached,
                stock: stockResult.stock,
            } as Product;
            const [productWithDiscount] = await this.applyDiscounts([
                productWithStock,
            ]);
            return productWithDiscount;
        }

        const product = await this.productsRepository.findOne({
            where: { id },
        });

        if (!product) {
            throw new NotFoundException('Product not found');
        }

        const { stock: _stock, ...cacheData } = product;
        await this.cacheService.set(cacheKey, cacheData, PRODUCT_CACHE_TTL);

        const [productWithDiscount] = await this.applyDiscounts([product]);
        return productWithDiscount;
    }

    async update(id: string, dto: UpdateProductDto) {
        const product = await this.productsRepository.findOne({
            where: { id },
        });
        if (!product) {
            throw new NotFoundException('Product not found');
        }

        if (dto.name !== undefined) {
            product.name = dto.name;
        }
        if (dto.description !== undefined) {
            product.description = dto.description;
        }
        if (dto.price !== undefined) {
            product.price = dto.price.toFixed(2);
        }
        if (dto.stock !== undefined) {
            product.stock = dto.stock;
        }

        const updated = await this.productsRepository.save(product);

        const { stock: _stock, ...cacheData } = updated;
        await this.cacheService.set(
            `product:${id}`,
            cacheData,
            PRODUCT_CACHE_TTL,
        );
        await this.cacheService.invalidatePattern('products:list:*');

        const [productWithDiscount] = await this.applyDiscounts([updated]);
        return productWithDiscount;
    }

    private async applyDiscounts(products: Product[]): Promise<any[]> {
        if (products.length === 0) return [];

        const discountKeys = products.map((p) => `discount:product:${p.id}`);
        discountKeys.push('discount:global:active');
        const discounts = await this.cacheService.mget<Discount>(discountKeys);
        const globalDiscount = discounts.pop();

        const now = new Date();
        const isValid = (d: Discount | null | undefined): d is Discount => {
            if (!d || !d.isActive) return false;
            if (d.startDate && new Date(d.startDate) > now) return false;
            if (d.endDate && new Date(d.endDate) <= now) return false;
            return true;
        };

        return products.map((product, index) => {
            const productDiscount = discounts[index];
            const basePrice = Number(product.price);

            let priceWithProductDiscount = basePrice;
            if (isValid(productDiscount)) {
                if (productDiscount.type === DiscountType.PERCENTAGE) {
                    priceWithProductDiscount =
                        basePrice * (1 - Number(productDiscount.value) / 100);
                } else if (productDiscount.type === DiscountType.FIXED) {
                    priceWithProductDiscount = Math.max(
                        0,
                        basePrice - Number(productDiscount.value),
                    );
                }
            }

            let priceWithGlobalDiscount = basePrice;
            if (isValid(globalDiscount)) {
                if (globalDiscount.type === DiscountType.PERCENTAGE) {
                    priceWithGlobalDiscount =
                        basePrice * (1 - Number(globalDiscount.value) / 100);
                } else if (globalDiscount.type === DiscountType.FIXED) {
                    priceWithGlobalDiscount = Math.max(
                        0,
                        basePrice - Number(globalDiscount.value),
                    );
                }
            }

            let finalPrice = basePrice;
            let appliedDiscount: {
                id: string;
                name: string;
                type: DiscountType;
                value: number;
            } | null = null;

            if (
                priceWithProductDiscount < basePrice ||
                priceWithGlobalDiscount < basePrice
            ) {
                if (priceWithProductDiscount <= priceWithGlobalDiscount) {
                    finalPrice = priceWithProductDiscount;
                    appliedDiscount = productDiscount
                        ? {
                              id: productDiscount.id,
                              name: productDiscount.name,
                              type: productDiscount.type,
                              value: Number(productDiscount.value),
                          }
                        : null;
                } else {
                    finalPrice = priceWithGlobalDiscount;
                    appliedDiscount = globalDiscount
                        ? {
                              id: globalDiscount.id,
                              name: globalDiscount.name,
                              type: globalDiscount.type,
                              value: Number(globalDiscount.value),
                          }
                        : null;
                }
            }

            return {
                ...product,
                originalPrice: basePrice,
                price: finalPrice.toFixed(2),
                discount: appliedDiscount,
            };
        });
    }
}
