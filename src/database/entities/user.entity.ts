export class UserEntity {}
import {
    Column,
    CreateDateColumn,
    Entity,
    OneToMany,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { CartItem } from './cart-item.entity';
import { InventoryLog } from './inventory-log.entity';
import { Order } from './order.entity';
import { WalletTransaction } from './wallet-transaction.entity';

export enum UserRole {
    SuperAdmin = 'superadmin',
    Admin = 'admin',
    Customer = 'customer',
}

@Entity('users')
export class User {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    email: string;

    @Column()
    passwordHash: string;

    @Column({ type: 'varchar', length: 20, default: UserRole.Customer })
    role: UserRole;

    @Column({ type: 'decimal', precision: 10, scale: 2, default: '0.00' })
    balance: string;

    @CreateDateColumn()
    createdAt: Date;

    @OneToMany(() => CartItem, (item) => item.user)
    cartItems: CartItem[];

    @OneToMany(() => Order, (order) => order.user)
    orders: Order[];

    @OneToMany(() => InventoryLog, (log) => log.admin)
    inventoryLogs: InventoryLog[];

    @OneToMany(() => WalletTransaction, (transaction) => transaction.user)
    walletTransactions: WalletTransaction[];

    @OneToMany(
        () => WalletTransaction,
        (transaction) => transaction.performedBy,
    )
    performedWalletTransactions: WalletTransaction[];
}
