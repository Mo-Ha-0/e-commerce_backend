import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CartItem } from '../database/entities/cart-item.entity';
import { OrderItem } from '../database/entities/order-item.entity';
import { Order, OrderStatus } from '../database/entities/order.entity';
import { Product } from '../database/entities/product.entity';
import { UserRole } from '../database/entities/user.entity';

@Injectable()
export class OrdersService {
    constructor(
        @InjectRepository(CartItem)
        private readonly cartRepository: Repository<CartItem>,
        @InjectRepository(Product)
        private readonly productsRepository: Repository<Product>,
        @InjectRepository(Order)
        private readonly ordersRepository: Repository<Order>,
        @InjectRepository(OrderItem)
        private readonly orderItemsRepository: Repository<OrderItem>,
    ) {}

    async checkout(userId: string) {
        const cartItems = await this.cartRepository.find({
            where: { userId },
            relations: { product: true },
        });

        if (cartItems.length === 0) {
            throw new BadRequestException('Cart is empty');
        }

        let totalAmount = 0;
        const orderItems: OrderItem[] = [];

        for (const cartItem of cartItems) {
            const product = await this.productsRepository.findOne({
                where: { id: cartItem.productId },
            });

            if (!product) {
                throw new NotFoundException('Product not found');
            }

            if (product.stock < cartItem.quantity) {
                throw new BadRequestException('Insufficient stock');
            }

            product.stock -= cartItem.quantity;
            await this.productsRepository.save(product);

            totalAmount += Number(product.price) * cartItem.quantity;

            orderItems.push(
                this.orderItemsRepository.create({
                    productId: product.id,
                    quantity: cartItem.quantity,
                    priceAtTime: product.price,
                }),
            );
        }

        const order = await this.ordersRepository.save(
            this.ordersRepository.create({
                userId,
                totalAmount: totalAmount.toFixed(2),
                status: OrderStatus.Completed,
            }),
        );

        for (const item of orderItems) {
            item.orderId = order.id;
        }

        order.items = await this.orderItemsRepository.save(orderItems);
        await this.cartRepository.delete({ userId });

        return order;
    }

    findMine(userId: string) {
        return this.ordersRepository.find({
            where: { userId },
            relations: { items: true },
            order: { createdAt: 'DESC' },
        });
    }

    async findOneForUser(orderId: string, userId: string, role: UserRole) {
        const order = await this.ordersRepository.findOne({
            where: { id: orderId },
            relations: { items: true },
        });

        if (!order) {
            throw new NotFoundException('Order not found');
        }

        if (
            role !== UserRole.Admin &&
            role !== UserRole.SuperAdmin &&
            order.userId !== userId
        ) {
            throw new ForbiddenException('Not allowed');
        }

        return order;
    }

    async findAll() {
        const orders = this.ordersRepository.find({
            relations: { items: true, user: true },
            order: { createdAt: 'DESC' },
        });

        const filteredOrders = (await orders).map((order) => {
            const { passwordHash, ...userWithoutPassword } = order.user;
            return {
                ...order,
                user: userWithoutPassword,
            };
        });

        return filteredOrders;
    }
}
