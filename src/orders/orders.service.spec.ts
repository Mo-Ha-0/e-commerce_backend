import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CartItem } from '../database/entities/cart-item.entity';
import { OrderItem } from '../database/entities/order-item.entity';
import {
    Order,
    OrderStatus,
    PaymentStatus,
} from '../database/entities/order.entity';
import { Product } from '../database/entities/product.entity';
import { User, UserRole } from '../database/entities/user.entity';
import { WalletTransaction } from '../database/entities/wallet-transaction.entity';
import { OrdersService } from './orders.service';

function createUser(balance: string): User {
    return {
        id: 'customer-id',
        email: 'customer@example.com',
        passwordHash: 'hash',
        role: UserRole.Customer,
        balance,
        createdAt: new Date(),
        cartItems: [],
        orders: [],
        inventoryLogs: [],
        walletTransactions: [],
        performedWalletTransactions: [],
    };
}

function createCheckoutHarness(user: User, product: Product) {
    const cartItems = [
        {
            userId: user.id,
            productId: product.id,
            quantity: 2,
            product,
        },
    ];

    const cartRepository = {
        find: jest.fn().mockResolvedValue(cartItems),
    };
    const ordersRepository = {
        create: jest.fn().mockImplementation((value) => ({
            id: 'order-id',
            ...value,
        })),
        save: jest.fn().mockImplementation(async (value) => value),
    };

    const userRepository = {
        findOne: jest.fn().mockResolvedValue(user),
        save: jest.fn().mockImplementation(async (value) => value),
    };
    const productRepository = {
        findOne: jest.fn().mockResolvedValue(product),
        save: jest.fn().mockImplementation(async (value) => value),
    };
    const orderRepository = {
        save: jest.fn().mockImplementation(async (value) => value),
    };
    const orderItemRepository = {
        create: jest.fn().mockImplementation((value) => value),
        save: jest
            .fn()
            .mockImplementation(async (value) =>
                value.map((item: OrderItem, index: number) => ({
                    id: `order-item-${index + 1}`,
                    ...item,
                })),
            ),
    };
    const walletTransactionRepository = {
        create: jest.fn().mockImplementation((value) => value),
        save: jest
            .fn()
            .mockImplementation(async (value) => ({
                id: 'wallet-transaction-id',
                ...value,
            })),
    };
    const transactionalCartRepository = {
        delete: jest.fn().mockResolvedValue(undefined),
    };

    const manager = {
        getRepository: (entity: unknown) => {
            if (entity === User) {
                return userRepository;
            }

            if (entity === Product) {
                return productRepository;
            }

            if (entity === Order) {
                return orderRepository;
            }

            if (entity === OrderItem) {
                return orderItemRepository;
            }

            if (entity === WalletTransaction) {
                return walletTransactionRepository;
            }

            if (entity === CartItem) {
                return transactionalCartRepository;
            }

            throw new Error('Unexpected repository');
        },
    };

    const dataSource = {
        transaction: jest.fn((callback) => callback(manager)),
    } as unknown as DataSource;

    const service = new OrdersService(
        dataSource,
        cartRepository as never,
        {} as never,
        ordersRepository as never,
        {} as never,
    );

    return {
        service,
        ordersRepository,
        productRepository,
        userRepository,
        orderRepository,
        orderItemRepository,
        walletTransactionRepository,
        transactionalCartRepository,
    };
}

describe('OrdersService checkout wallet payment', () => {
    it('deducts wallet balance, stock, clears cart, and records payment', async () => {
        const user = createUser('1000.00');
        const product = {
            id: 'product-id',
            name: 'Wallet Product',
            description: '',
            price: '125.25',
            stock: 5,
            createdAt: new Date(),
            updatedAt: new Date(),
            cartItems: [],
            orderItems: [],
            inventoryLogs: [],
            salesSummaries: [],
        };
        const harness = createCheckoutHarness(user, product);

        const order = await harness.service.checkout(user.id);

        expect(user.balance).toBe('749.50');
        expect(product.stock).toBe(3);
        expect(order.totalAmount).toBe('250.50');
        expect(order.status).toBe(OrderStatus.Completed);
        expect(order.paymentStatus).toBe(PaymentStatus.Paid);
        expect(order.walletTransactionId).toBe('wallet-transaction-id');
        expect(harness.transactionalCartRepository.delete).toHaveBeenCalledWith({
            userId: user.id,
        });
        expect(harness.walletTransactionRepository.save).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: user.id,
                amount: '250.50',
                balanceBefore: '1000.00',
                balanceAfter: '749.50',
                referenceId: 'order-id',
            }),
        );
    });

    it('does not save stock, debit money, or clear cart when balance is too low', async () => {
        const user = createUser('10.00');
        const product = {
            id: 'product-id',
            name: 'Wallet Product',
            description: '',
            price: '125.25',
            stock: 5,
            createdAt: new Date(),
            updatedAt: new Date(),
            cartItems: [],
            orderItems: [],
            inventoryLogs: [],
            salesSummaries: [],
        };
        const harness = createCheckoutHarness(user, product);

        await expect(harness.service.checkout(user.id)).rejects.toBeInstanceOf(
            BadRequestException,
        );

        expect(user.balance).toBe('10.00');
        expect(product.stock).toBe(5);
        expect(harness.productRepository.save).not.toHaveBeenCalled();
        expect(harness.userRepository.save).not.toHaveBeenCalled();
        expect(harness.walletTransactionRepository.save).not.toHaveBeenCalled();
        expect(harness.orderItemRepository.save).not.toHaveBeenCalled();
        expect(harness.transactionalCartRepository.delete).not.toHaveBeenCalled();
        expect(harness.ordersRepository.save).toHaveBeenLastCalledWith(
            expect.objectContaining({
                status: OrderStatus.Failed,
                paymentStatus: PaymentStatus.Failed,
            }),
        );
    });
});
