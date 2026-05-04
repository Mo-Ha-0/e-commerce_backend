import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../database/entities/product.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
    constructor(
        @InjectRepository(Product)
        private readonly productsRepository: Repository<Product>,
    ) {}

    create(dto: CreateProductDto) {
        return this.productsRepository.save(
            this.productsRepository.create({
                name: dto.name,
                description: dto.description ?? '',
                price: dto.price.toFixed(2),
                stock: dto.stock,
            }),
        );
    }

    findAll(page = 1, limit = 20) {
        const safePage = Math.max(page, 1);
        const safeLimit = Math.min(Math.max(limit, 1), 100);

        return this.productsRepository.findAndCount({
            order: { createdAt: 'DESC' },
            skip: (safePage - 1) * safeLimit,
            take: safeLimit,
        });
    }

    async findOne(id: string) {
        if (id.length !== 36 || !/^[0-9a-fA-F-]+$/.test(id)) {
            throw new NotFoundException('Invalid ID format');
        }
        const product = await this.productsRepository.findOne({
            where: { id },
        });

        if (!product) {
            throw new NotFoundException('Product not found');
        }

        return product;
    }

    async update(id: string, dto: UpdateProductDto) {
        const product = await this.findOne(id);

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

        return this.productsRepository.save(product);
    }
}
