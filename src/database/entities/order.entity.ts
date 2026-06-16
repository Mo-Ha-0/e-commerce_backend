import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { OrderItem } from './order-item.entity';
import { User } from './user.entity';
import { WalletTransaction } from './wallet-transaction.entity';

export enum OrderStatus {
    Pending = 'pending',
    Processing = 'processing',
    Completed = 'completed',
    Failed = 'failed',
}

export enum PaymentStatus {
    Pending = 'pending',
    Paid = 'paid',
    Failed = 'failed',
}

@Entity('orders')
export class Order {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ nullable: true, unique: true })
    idempotencyKey?: string;

    @Column()
    userId: string;

    @ManyToOne(() => User, (user) => user.orders, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'userId' })
    user: User;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    totalAmount: string;

    @Column({ type: 'varchar', length: 20, default: OrderStatus.Pending })
    status: OrderStatus;

    @Column({ type: 'varchar', length: 20, default: PaymentStatus.Pending })
    paymentStatus: PaymentStatus;

    @Column({ type: 'timestamp', nullable: true })
    paidAt?: Date;

    @Column({ type: 'uuid', nullable: true })
    walletTransactionId?: string;

    @Column({ type: 'varchar', length: 500, nullable: true })
    invoicePdfPath?: string;

    @ManyToOne(() => WalletTransaction, { nullable: true })
    @JoinColumn({ name: 'walletTransactionId' })
    walletTransaction?: WalletTransaction;

    @CreateDateColumn()
    createdAt: Date;

    @OneToMany(() => OrderItem, (item) => item.order, { cascade: true })
    items: OrderItem[];
}
