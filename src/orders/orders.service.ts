import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { centsToMoney, moneyToCents } from '../common/money';
import { Semaphore } from '../common/semaphore';
import { CartItem } from '../database/entities/cart-item.entity';
import { OrderItem } from '../database/entities/order-item.entity';
import {
    Order,
    OrderStatus,
    PaymentStatus,
} from '../database/entities/order.entity';
import { Product } from '../database/entities/product.entity';
import { User, UserRole } from '../database/entities/user.entity';
import {
    WalletTransaction,
    WalletTransactionReason,
    WalletTransactionType,
} from '../database/entities/wallet-transaction.entity';

@Injectable()
export class OrdersService {
    private readonly checkoutSemaphore = new Semaphore(10);

    constructor(
        @InjectDataSource()
        private readonly dataSource: DataSource,
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
        const release = await this.checkoutSemaphore.acquire();
        let order: Order | undefined;

        try {
            const cartItems = await this.cartRepository.find({
                where: { userId },
                relations: { product: true },
            });

            if (cartItems.length === 0) {
                throw new BadRequestException('Cart is empty');
            }

            order = await this.ordersRepository.save(
                this.ordersRepository.create({
                    userId,
                    totalAmount: '0.00',
                    status: OrderStatus.Pending,
                    paymentStatus: PaymentStatus.Pending,
                }),
            );

            const savedOrder = order;

            const { items } = await this.dataSource.transaction(
                async (manager) => {
                    cartItems.sort((a, b) =>
                        a.productId.localeCompare(b.productId),
                    );

                    savedOrder.status = OrderStatus.Processing;
                    await manager.getRepository(Order).save(savedOrder);

                    const user = await manager.getRepository(User).findOne({
                        where: { id: userId },
                        lock: { mode: 'pessimistic_write' },
                    });

                    if (!user) {
                        throw new NotFoundException('User not found');
                    }

                    let totalAmountCents = 0;
                    const productsToUpdate: Array<{
                        product: Product;
                        newStock: number;
                    }> = [];
                    const orderItems: OrderItem[] = [];

                    for (const cartItem of cartItems) {
                        const product = await manager
                            .getRepository(Product)
                            .findOne({
                                where: { id: cartItem.productId },
                                lock: { mode: 'pessimistic_write' },
                            });

                        if (!product) {
                            throw new NotFoundException('Product not found');
                        }

                        if (product.stock < cartItem.quantity) {
                            throw new BadRequestException('Insufficient stock');
                        }

                        productsToUpdate.push({
                            product,
                            newStock: product.stock - cartItem.quantity,
                        });

                        totalAmountCents +=
                            moneyToCents(product.price) * cartItem.quantity;

                        orderItems.push(
                            manager.getRepository(OrderItem).create({
                                orderId: savedOrder.id,
                                productId: product.id,
                                quantity: cartItem.quantity,
                                priceAtTime: product.price,
                            }),
                        );
                    }

                    const balanceBeforeCents = moneyToCents(user.balance);

                    if (balanceBeforeCents < totalAmountCents) {
                        throw new BadRequestException(
                            'Insufficient wallet balance',
                        );
                    }

                    const balanceAfterCents =
                        balanceBeforeCents - totalAmountCents;

                    for (const { product, newStock } of productsToUpdate) {
                        product.stock = newStock;
                    }

                    await manager
                        .getRepository(Product)
                        .save(productsToUpdate.map(({ product }) => product));

                    user.balance = centsToMoney(balanceAfterCents);
                    await manager.getRepository(User).save(user);

                    const walletTransaction = await manager
                        .getRepository(WalletTransaction)
                        .save(
                            manager.getRepository(WalletTransaction).create({
                                userId: user.id,
                                type: WalletTransactionType.Debit,
                                reason: WalletTransactionReason.CheckoutPayment,
                                amount: centsToMoney(totalAmountCents),
                                balanceBefore: centsToMoney(balanceBeforeCents),
                                balanceAfter: user.balance,
                                referenceId: savedOrder.id,
                                performedByUserId: user.id,
                                note: 'Checkout payment',
                            }),
                        );

                    const items = await manager
                        .getRepository(OrderItem)
                        .save(orderItems);

                    await manager.getRepository(CartItem).delete({ userId });

                    savedOrder.items = items;
                    savedOrder.totalAmount = centsToMoney(totalAmountCents);
                    savedOrder.status = OrderStatus.Completed;
                    savedOrder.paymentStatus = PaymentStatus.Paid;
                    savedOrder.paidAt = new Date();
                    savedOrder.walletTransactionId = walletTransaction.id;
                    await manager.getRepository(Order).save(savedOrder);

                    return { items };
                },
            );

            savedOrder.items = items;

            return savedOrder;
        } catch (error) {
            if (order) {
                order.status = OrderStatus.Failed;
                order.paymentStatus = PaymentStatus.Failed;
                await this.ordersRepository.save(order);
            }
            throw error;
        } finally {
            release();
        }
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
