import {
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '../database/entities/order.entity';
import { User, UserRole } from '../database/entities/user.entity';

@Injectable()
export class OrdersService {
    constructor(
        @InjectRepository(Order)
        private readonly ordersRepository: Repository<Order>,
    ) {}

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
        const orders = await this.ordersRepository.find({
            relations: { items: true, user: true },
            order: { createdAt: 'DESC' },
        });

        return orders.map((order) => {
            const { passwordHash, ...userWithoutPassword } = order.user;
            return {
                ...order,
                user: userWithoutPassword,
            };
        });
    }
}
