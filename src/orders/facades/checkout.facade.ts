import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { centsToMoney, moneyToCents } from '../../common/money';
import { DistributedLockService } from '../../common/distributed-lock.service';
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
import { CacheService } from '../../common/cache/cache.service';
import {
    Discount,
    DiscountType,
} from '../../database/entities/discount.entity';
import { LowStockNotificationService } from '../../notifications/low-stock-notification.service';
import { FailedJob } from '../../database/entities/failed-job.entity';

@Injectable()
export class CheckoutFacade {
    private readonly logger = new Logger(CheckoutFacade.name);

    constructor(
        @InjectDataSource()
        private readonly dataSource: DataSource,
        @InjectRepository(CartItem)
        private readonly cartRepository: Repository<CartItem>,
        @InjectRepository(Order)
        private readonly ordersRepository: Repository<Order>,
        @InjectRepository(FailedJob)
        private readonly failedJobsRepository: Repository<FailedJob>,
        private readonly stockValidationService: StockValidationService,
        private readonly emailService: EmailService,
        private readonly invoicePdfService: InvoicePdfService,
        private readonly lowStockNotificationService: LowStockNotificationService,
        private readonly cacheService: CacheService,
        private readonly distributedLock: DistributedLockService,
    ) {}

    async checkout(userId: string, idempotencyKey?: string) {
        if (idempotencyKey) {
            const existing = await this.ordersRepository.findOne({
                where: { idempotencyKey },
                relations: { items: true },
            });
            if (existing) return existing;
        }

        const checkoutLockKey = `lock:checkout:${userId}`;
        const checkoutAcquired = await this.distributedLock.acquire(
            checkoutLockKey,
            30_000, // 30s TTL — enough for the whole transaction
        );

        if (!checkoutAcquired) {
            throw new BadRequestException(
                'A checkout is already in progress for this user',
            );
        }

        let order: Order | undefined;
        const acquiredStockLocks: string[] = [];

        try {
            const cartItems = await this.cartRepository.find({
                where: { userId },
            });

            if (cartItems.length === 0) {
                throw new BadRequestException('Cart is empty');
            }

            // Sort product IDs to acquire stock locks in a consistent order,
            // preventing distributed deadlocks across concurrent checkouts.
            const sortedProductIds = [
                ...new Set(cartItems.map((i) => i.productId)),
            ].sort();

            for (const productId of sortedProductIds) {
                const stockLockKey = `lock:stock:${productId}`;
                const stockAcquired = await this.distributedLock.acquire(
                    stockLockKey,
                    10_000, // 10s TTL per product lock
                );

                if (!stockAcquired) {
                    throw new BadRequestException(
                        `Could not reserve stock for product ${productId}. Please try again.`,
                    );
                }

                acquiredStockLocks.push(stockLockKey);
            }

            order = await this.ordersRepository.save(
                this.ordersRepository.create({
                    userId,
                    idempotencyKey: idempotencyKey,
                    totalAmount: '0.00',
                    status: OrderStatus.Pending,
                    paymentStatus: PaymentStatus.Pending,
                }),
            );

            const savedOrder = order;

            const discountKeys = cartItems.map(
                (item) => `discount:product:${item.productId}`,
            );
            discountKeys.push('discount:global:active');

            const discounts =
                await this.cacheService.mget<Discount>(discountKeys);
            const globalDiscount = discounts.pop();

            const now = new Date();
            const isValid = (d: Discount | null | undefined): d is Discount => {
                if (!d || !d.isActive) return false;
                if (d.startDate && new Date(d.startDate) > now) return false;
                if (d.endDate && new Date(d.endDate) <= now) return false;
                return true;
            };

            const discountMap = new Map<string, Discount>();
            discounts.forEach((discount) => {
                if (isValid(discount) && discount.productId) {
                    discountMap.set(discount.productId, discount);
                }
            });

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

                        const basePriceCents = moneyToCents(product.price);
                        let priceWithProductDiscountCents = basePriceCents;
                        let priceWithGlobalDiscountCents = basePriceCents;
                        const productDiscount = discountMap.get(product.id);

                        if (productDiscount) {
                            let priceFloat = Number(product.price);
                            if (
                                productDiscount.type === DiscountType.PERCENTAGE
                            ) {
                                priceFloat =
                                    priceFloat *
                                    (1 - Number(productDiscount.value) / 100);
                            } else if (
                                productDiscount.type === DiscountType.FIXED
                            ) {
                                priceFloat = Math.max(
                                    0,
                                    priceFloat - Number(productDiscount.value),
                                );
                            }
                            priceWithProductDiscountCents = Math.round(
                                priceFloat * 100,
                            );
                        }

                        if (isValid(globalDiscount)) {
                            let priceFloat = Number(product.price);
                            if (
                                globalDiscount.type === DiscountType.PERCENTAGE
                            ) {
                                priceFloat =
                                    priceFloat *
                                    (1 - Number(globalDiscount.value) / 100);
                            } else if (
                                globalDiscount.type === DiscountType.FIXED
                            ) {
                                priceFloat = Math.max(
                                    0,
                                    priceFloat - Number(globalDiscount.value),
                                );
                            }
                            priceWithGlobalDiscountCents = Math.round(
                                priceFloat * 100,
                            );
                        }

                        const finalPriceCents = Math.min(
                            priceWithProductDiscountCents,
                            priceWithGlobalDiscountCents,
                            basePriceCents,
                        );

                        totalAmountCents += finalPriceCents * cartItem.quantity;

                        orderItems.push(
                            manager.getRepository(OrderItem).create({
                                orderId: savedOrder.id,
                                productId: product.id,
                                quantity: cartItem.quantity,
                                priceAtTime: centsToMoney(finalPriceCents),
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
            // Always release stock locks first (LIFO order), then the user checkout lock.
            for (const lockKey of acquiredStockLocks.reverse()) {
                await this.distributedLock.release(lockKey);
            }
            await this.distributedLock.release(checkoutLockKey);
        }
    }

    private async enqueuePostCheckoutJobs(
        orderId: string,
        products: Product[],
    ) {
        const jobs: Array<{
            name: string;
            fn: () => Promise<unknown>;
        }> = [
            {
                name: 'email:order-confirmation',
                fn: () => this.emailService.enqueueOrderConfirmation(orderId),
            },
            {
                name: 'invoice:generation',
                fn: () =>
                    this.invoicePdfService.enqueueInvoiceGeneration(orderId),
            },
            {
                name: 'low-stock:alert',
                fn: () =>
                    this.lowStockNotificationService.enqueueLowStockAlerts(
                        orderId,
                        products,
                    ),
            },
        ];

        for (const job of jobs) {
            try {
                await job.fn();
            } catch (err) {
                const errorMessage =
                    err instanceof Error ? err.message : String(err);
                this.logger.error(
                    `Post-checkout job "${job.name}" failed for order ${orderId}: ${errorMessage}`,
                );

                await this.failedJobsRepository.save(
                    this.failedJobsRepository.create({
                        orderId,
                        jobType: job.name,
                        error: errorMessage,
                        retryCount: 0,
                        pendingRetry: true,
                    }),
                );
            }
        }
    }
}
