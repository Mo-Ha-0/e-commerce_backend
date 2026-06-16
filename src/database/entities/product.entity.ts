import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    OneToMany,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
    VersionColumn,
} from 'typeorm';
import { CartItem } from './cart-item.entity';
import { InventoryLog } from './inventory-log.entity';
import { OrderItem } from './order-item.entity';
import { SalesSummary } from './sales-summary.entity';

@Entity('products')
export class Product {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string;

    @Column({ type: 'text', default: '' })
    description: string;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    price: string;

    @Index()
    @Column({ type: 'int', default: 0 })
    stock: number;

    @Index()
    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @VersionColumn()
    version: number;

    @OneToMany(() => CartItem, (item) => item.product)
    cartItems: CartItem[];

    @OneToMany(() => OrderItem, (item) => item.product)
    orderItems: OrderItem[];

    @OneToMany(() => InventoryLog, (log) => log.product)
    inventoryLogs: InventoryLog[];

    @OneToMany(() => SalesSummary, (summary) => summary.product)
    salesSummaries: SalesSummary[];
}
