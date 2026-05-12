import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { CartItem } from './entities/cart-item.entity';
import { Product } from './entities/product.entity';
import { User, UserRole } from './entities/user.entity';
import { existsSync, readFileSync } from 'fs';
import { InventoryLog } from './entities/inventory-log.entity';
import { OrderItem } from './entities/order-item.entity';
import { Order } from './entities/order.entity';
import { SalesSummary } from './entities/sales-summary.entity';
import { WalletTransaction } from './entities/wallet-transaction.entity';

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

async function seedTestUsers() {
    loadEnvFile();
    const dataSource = new DataSource({
        type: 'postgres',
        host: process.env.DB_HOST ?? 'localhost',
        port: Number(process.env.DB_PORT ?? 5432),
        username: process.env.DB_USER ?? 'mrmohammed',
        password: process.env.DB_PASS ?? 'youruncletruepassword',
        database:
            process.env.DB_NAME ??
            'ecommerce_database_for_the_legends_of_the_workd',
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
        synchronize: false,
    });

    await dataSource.initialize();

    const userRepo = dataSource.getRepository(User);
    const cartRepo = dataSource.getRepository(CartItem);
    const productRepo = dataSource.getRepository(Product);

    const raceProduct = await productRepo.findOne({
        where: { name: 'Seed Race Condition Product' },
    });

    if (!raceProduct) {
        throw new Error('Run the main seed first: npm run seed');
    }

    raceProduct.stock = 1;
    await productRepo.save(raceProduct);

    const passwordHash = await bcrypt.hash('password123', 10);
    const users: User[] = [];

    console.log('Creating 100 test users...');

    for (let i = 1; i <= 100; i++) {
        const email = `testuser${i}@test.com`;

        let user = await userRepo.findOne({ where: { email } });

        if (!user) {
            user = await userRepo.save(
                userRepo.create({
                    email,
                    passwordHash,
                    role: UserRole.Customer,
                    balance: '100.00',
                }),
            );
        } else {
            user.balance = '100.00';
            await userRepo.save(user);
        }

        await cartRepo.delete({ userId: user.id });
        // await cartRepo.save(
        //     cartRepo.create({
        //         userId: user.id,
        //         productId: raceProduct.id,
        //         quantity: 1,
        //     }),
        // );

        users.push(user);
    }

    console.log('Done. 100 users created with product in cart.');
    console.log(`Race condition product id: ${raceProduct.id}`);
    console.log(`Race condition product stock: ${raceProduct.stock}`);

    await dataSource.destroy();
}

void seedTestUsers().catch((err) => {
    console.error(err);
    process.exit(1);
});
