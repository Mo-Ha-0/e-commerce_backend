import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { centsToMoney, moneyToCents } from '../../common/money';
import { Semaphore } from '../../common/semaphore';
import { CartItem } from '../../database/entities/cart-item.entity';
import { OrderItem } from '../../database/entities/order-item.entity';
import {
    Order,
    OrderStatus,
    PaymentStatus,
} from '../../database/entities/order.entity';
import { Product } from '../../database/entities/product.entity';
import { User } from '../../database/entities/user.entity';
import {
    WalletTransaction,
    WalletTransactionReason,
    WalletTransactionType,
} from '../../database/entities/wallet-transaction.entity';
import { EmailService } from '../../email/email.service';
import { StockValidationService } from '../../inventory/services/stock-validation.service';
import { InvoicePdfService } from '../../invoice/invoice-pdf.service';
import { LowStockNotificationService } from '../../notifications/low-stock-notification.service';

@Injectable()
export class CheckoutFacade {
    private readonly logger = new Logger(CheckoutFacade.name);
    private readonly checkoutSemaphore: Semaphore;

    constructor(
        @InjectDataSource()
        private readonly dataSource: DataSource,
        @InjectRepository(CartItem)
        private readonly cartRepository: Repository<CartItem>,
        @InjectRepository(Order)
        private readonly ordersRepository: Repository<Order>,
        private readonly stockValidationService: StockValidationService,
        private readonly emailService: EmailService,
        private readonly invoicePdfService: InvoicePdfService,
        private readonly lowStockNotificationService: LowStockNotificationService,
        configService: ConfigService,
    ) {
        this.checkoutSemaphore = new Semaphore(
            Number(configService.get<string>('CHECKOUT_MAX_CONCURRENT', '10')),
        );
    }

    async checkout(userId: string) {
        const release = await this.checkoutSemaphore.acquire();
        let order: Order | undefined;

        try {
            const cartItems = await this.cartRepository.find({
                where: { userId },
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
            const { items, updatedProducts } =
                await this.dataSource.transaction(async (manager) => {
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

                    const lockedStockItems =
                        await this.stockValidationService.validateCheckoutItems(
                            manager,
                            cartItems,
                        );
                    const lockedProductsById = new Map(
                        lockedStockItems.map(({ product }) => [
                            product.id,
                            product,
                        ]),
                    );

                    let totalAmountCents = 0;
                    const orderItems: OrderItem[] = [];

                    for (const cartItem of cartItems) {
                        const product = lockedProductsById.get(
                            cartItem.productId,
                        );

                        if (!product) {
                            throw new NotFoundException('Product not found');
                        }

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

                    for (const { product, newStock } of lockedStockItems) {
                        product.stock = newStock;
                    }

                    const updatedProducts = await manager
                        .getRepository(Product)
                        .save(lockedStockItems.map(({ product }) => product));

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

                    return { items, updatedProducts };
                });

            savedOrder.items = items;

            await this.enqueuePostCheckoutJobs(savedOrder.id, updatedProducts);

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

    private async enqueuePostCheckoutJobs(
        orderId: string,
        products: Product[],
    ) {
        const results = await Promise.allSettled([
            this.emailService.enqueueOrderConfirmation(orderId),
            this.invoicePdfService.enqueueInvoiceGeneration(orderId),
            this.lowStockNotificationService.enqueueLowStockAlerts(
                orderId,
                products,
            ),
        ]);

        results.forEach((result) => {
            if (result.status === 'rejected') {
                this.logger.error(
                    `Post-checkout job enqueue failed for order ${orderId}`,
                    result.reason instanceof Error
                        ? result.reason.stack
                        : String(result.reason),
                );
            }
        });
    }
}
