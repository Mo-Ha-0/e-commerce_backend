import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { Product } from './product.entity';
import { User } from './user.entity';

@Entity('inventory_logs')
export class InventoryLog {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    productId: string;

    @ManyToOne(() => Product, (product) => product.inventoryLogs)
    @JoinColumn({ name: 'productId' })
    product: Product;

    @Column()
    adminId: string;

    @ManyToOne(() => User, (user) => user.inventoryLogs)
    @JoinColumn({ name: 'adminId' })
    admin: User;

    @Column({ type: 'int' })
    previousStock: number;

    @Column({ type: 'int' })
    newStock: number;

    @Column({ type: 'int' })
    change: number;

    @Column({ default: 'manual-update' })
    reason: string;

    @CreateDateColumn()
    createdAt: Date;
}
