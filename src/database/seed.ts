import 'reflect-metadata';
import { existsSync, readFileSync } from 'fs';
import * as bcrypt from 'bcrypt';
import { DataSource, Repository } from 'typeorm';
import { CartItem } from './entities/cart-item.entity';
import { InventoryLog } from './entities/inventory-log.entity';
import { OrderItem } from './entities/order-item.entity';
import { Order, OrderStatus, PaymentStatus } from './entities/order.entity';
import { Product } from './entities/product.entity';
import { SalesSummary } from './entities/sales-summary.entity';
import { User, UserRole } from './entities/user.entity';
import {
    WalletTransaction,
    WalletTransactionReason,
    WalletTransactionType,
} from './entities/wallet-transaction.entity';

type SeedProduct = {
    name: string;
    description: string;
    price: string;
    stock: number;
};

const seedProducts: SeedProduct[] = [
    {
        name: 'Seed Laptop Pro',
        description: 'High-stock product for normal checkout tests',
        price: '1499.99',
        stock: 100,
    },
    {
        name: 'Seed Mechanical Keyboard',
        description: 'Low-stock product for inventory and low-stock tests',
        price: '129.50',
        stock: 3,
    },
    {
        name: 'Seed Wireless Mouse',
        description: 'Out-of-stock product for insufficient-stock tests',
        price: '49.99',
        stock: 0,
    },
    {
        name: 'Seed Race Condition Product',
        description: 'Stock = 1 product for concurrent checkout race tests',
        price: '99.99',
        stock: 1,
    },
    {
        name: 'Seed Noise Canceling Headphones',
        description: 'Product used by the seeded completed order',
        price: '249.99',
        stock: 25,
    },
];

function loadEnvFile() {
    if (!existsSync('.env')) {
        return;
    }

    const lines = readFileSync('.env', 'utf8').split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
            continue;
        }

        const [key, ...valueParts] = trimmed.split('=');
        if (!process.env[key]) {
            process.env[key] = valueParts.join('=').replace(/^["']|["']$/g, '');
        }
    }
}

function createDataSource() {
    loadEnvFile();

    return new DataSource({
        type: 'postgres',
        host: process.env.DB_HOST ?? 'localhost',
        port: Number(process.env.DB_PORT ?? 5432),
        username: process.env.DB_USER ?? 'admin',
        password: process.env.DB_PASS ?? 'password',
        database: process.env.DB_NAME ?? 'ecommerce_first_five',
        entities: [
            User,
            Product,
            CartItem,
            Order,
            OrderItem,
            InventoryLog,
            SalesSummary,
            WalletTransaction,
        ],
        synchronize: (process.env.TYPEORM_SYNC ?? 'true') === 'true',
        logging: (process.env.TYPEORM_LOGGING ?? 'false') === 'true',
        extra: {
            max: Number(process.env.DB_POOL_MAX ?? 10),
        },
    });
}

async function upsertUser(
    repository: Repository<User>,
    email: string,
    role: UserRole,
    balance = '0.00',
) {
    const passwordHash = await bcrypt.hash('password123', 10);
    const existing = await repository.findOne({ where: { email } });

    if (existing) {
        existing.role = role;
        existing.passwordHash = passwordHash;
        existing.balance = balance;
        return repository.save(existing);
    }

    return repository.save(
        repository.create({
            email,
            passwordHash,
            role,
            balance,
        }),
    );
}

async function upsertProduct(
    repository: Repository<Product>,
    input: SeedProduct,
) {
    const existing = await repository.findOne({ where: { name: input.name } });

    if (existing) {
        existing.description = input.description;
        existing.price = input.price;
        existing.stock = input.stock;
        return repository.save(existing);
    }

    return repository.save(repository.create(input));
}

async function seedCompletedOrder(
    orderRepository: Repository<Order>,
    itemRepository: Repository<OrderItem>,
    customer: User,
    product: Product,
) {
    const existingSeedItem = await itemRepository.findOne({
        where: { productId: product.id },
        relations: { order: true },
    });

    if (existingSeedItem?.order) {
        return existingSeedItem.order;
    }

    const order = await orderRepository.save(
        orderRepository.create({
            userId: customer.id,
            totalAmount: (Number(product.price) * 2).toFixed(2),
            status: OrderStatus.Completed,
            paymentStatus: PaymentStatus.Paid,
            paidAt: new Date(),
        }),
    );

    order.items = await itemRepository.save([
        itemRepository.create({
            orderId: order.id,
            productId: product.id,
            quantity: 2,
            priceAtTime: product.price,
        }),
    ]);

    return order;
}

async function seedInventoryLog(
    repository: Repository<InventoryLog>,
    admin: User,
    product: Product,
) {
    const existing = await repository.findOne({
        where: { productId: product.id, reason: 'seed-data' },
    });

    if (existing) {
        return existing;
    }

    return repository.save(
        repository.create({
            productId: product.id,
            adminId: admin.id,
            previousStock: product.stock,
            newStock: product.stock,
            change: 0,
            reason: 'seed-data',
        }),
    );
}

async function seedWalletTransactions(
    repository: Repository<WalletTransaction>,
    admin: User,
    customer: User,
    seedOrder: Order,
) {
    const existing = await repository.findOne({
        where: {
            userId: customer.id,
            reason: WalletTransactionReason.AdminDeposit,
            note: 'seed-wallet-credit',
        },
    });

    if (existing) {
        return;
    }

    const [, debit] = await repository.save([
        repository.create({
            userId: customer.id,
            type: WalletTransactionType.Credit,
            reason: WalletTransactionReason.AdminDeposit,
            amount: '5000.00',
            balanceBefore: '0.00',
            balanceAfter: '5000.00',
            performedByUserId: admin.id,
            note: 'seed-wallet-credit',
        }),
        repository.create({
            userId: customer.id,
            type: WalletTransactionType.Debit,
            reason: WalletTransactionReason.CheckoutPayment,
            amount: seedOrder.totalAmount,
            balanceBefore: '5000.00',
            balanceAfter: customer.balance,
            referenceId: seedOrder.id,
            performedByUserId: customer.id,
            note: 'seed-checkout-payment',
        }),
    ]);

    seedOrder.walletTransactionId = debit.id;
    await repository.manager.getRepository(Order).save(seedOrder);
}

async function clearSeedCarts(repository: Repository<CartItem>, users: User[]) {
    for (const user of users) {
        await repository.delete({ userId: user.id });
    }
}

async function clearDatabase(dataSource: DataSource) {
    await dataSource.query(`
    TRUNCATE TABLE
        order_items,
        orders,
        cart_items,
        wallet_transactions,
        inventory_logs,
        sales_summary,
        products,
        users
    RESTART IDENTITY CASCADE;
`);
}

async function seed() {
    const dataSource = createDataSource();
    await dataSource.initialize();

    try {
        await clearDatabase(dataSource);

        const userRepository = dataSource.getRepository(User);
        const productRepository = dataSource.getRepository(Product);
        const cartRepository = dataSource.getRepository(CartItem);
        const orderRepository = dataSource.getRepository(Order);
        const itemRepository = dataSource.getRepository(OrderItem);
        const logRepository = dataSource.getRepository(InventoryLog);
        const walletTransactionRepository =
            dataSource.getRepository(WalletTransaction);

        const superadmin = await upsertUser(
            userRepository,
            'superadmin@example.com',
            UserRole.SuperAdmin,
        );
        const admin = await upsertUser(
            userRepository,
            'admin@example.com',
            UserRole.Admin,
        );
        const customer = await upsertUser(
            userRepository,
            'hamadmohamad937@gmail.com',
            UserRole.Customer,
            '4500.02',
        );
        const secondCustomer = await upsertUser(
            userRepository,
            'customer2@example.com',
            UserRole.Customer,
            '1000.00',
        );

        await clearSeedCarts(cartRepository, [customer, secondCustomer]);

        const products: Product[] = [];
        for (const product of seedProducts) {
            products.push(await upsertProduct(productRepository, product));
        }

        const batchProduct =
            products.find(
                (product) => product.name === 'Seed Noise Canceling Headphones',
            ) ?? products[0];
        const lowStockProduct =
            products.find(
                (product) => product.name === 'Seed Mechanical Keyboard',
            ) ?? products[0];

        const seedOrder = await seedCompletedOrder(
            orderRepository,
            itemRepository,
            customer,
            batchProduct,
        );
        await seedWalletTransactions(
            walletTransactionRepository,
            admin,
            customer,
            seedOrder,
        );
        await seedInventoryLog(logRepository, admin, lowStockProduct);

        console.log('Seed completed successfully.');
        console.log('');
        console.log('Password for all seeded accounts: password123');
        console.table([
            {
                role: superadmin.role,
                email: superadmin.email,
                id: superadmin.id,
            },
            { role: admin.role, email: admin.email, id: admin.id },
            { role: customer.role, email: customer.email, id: customer.id },
            {
                role: secondCustomer.role,
                email: secondCustomer.email,
                id: secondCustomer.id,
            },
        ]);
        console.table(
            products.map((product) => ({
                name: product.name,
                id: product.id,
                price: product.price,
                stock: product.stock,
            })),
        );
        console.log(`Seed completed order id: ${seedOrder.id}`);
    } finally {
        await dataSource.destroy();
    }
}

void seed().catch((error: unknown) => {
    console.error('Seed failed.');
    console.error(error);
    process.exit(1);
});
