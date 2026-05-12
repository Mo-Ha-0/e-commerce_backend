import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum WalletTransactionType {
    Credit = 'credit',
    Debit = 'debit',
}

export enum WalletTransactionReason {
    AdminDeposit = 'admin_deposit',
    CheckoutPayment = 'checkout_payment',
}

@Entity('wallet_transactions')
export class WalletTransaction {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    userId: string;

    @ManyToOne(() => User, (user) => user.walletTransactions, {
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'userId' })
    user: User;

    @Column({ type: 'varchar', length: 20 })
    type: WalletTransactionType;

    @Column({ type: 'varchar', length: 40 })
    reason: WalletTransactionReason;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    amount: string;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    balanceBefore: string;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    balanceAfter: string;

    @Column({ type: 'uuid', nullable: true })
    referenceId?: string;

    @Column({ type: 'uuid', nullable: true })
    performedByUserId?: string;

    @ManyToOne(() => User, (user) => user.performedWalletTransactions, {
        nullable: true,
        onDelete: 'SET NULL',
    })
    @JoinColumn({ name: 'performedByUserId' })
    performedBy?: User;

    @Column({ type: 'varchar', length: 255, nullable: true })
    note?: string;

    @CreateDateColumn()
    createdAt: Date;
}
