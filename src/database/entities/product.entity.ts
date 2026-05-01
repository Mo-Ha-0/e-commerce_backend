import {
    Column,
    CreateDateColumn,
    Entity,
    OneToMany,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
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

    @Column({ type: 'int', default: 0 })
    stock: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(() => CartItem, (item) => item.product)
    cartItems: CartItem[];

    @OneToMany(() => OrderItem, (item) => item.product)
    orderItems: OrderItem[];

    @OneToMany(() => InventoryLog, (log) => log.product)
    inventoryLogs: InventoryLog[];

    @OneToMany(() => SalesSummary, (summary) => summary.product)
    salesSummaries: SalesSummary[];
}
