import {
    Column,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { Order } from './order.entity';
import { Product } from './product.entity';

@Entity('order_items')
export class OrderItem {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    orderId: string;

    @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'orderId' })
    order: Order;

    @Column()
    productId: string;

    @ManyToOne(() => Product, (product) => product.orderItems)
    @JoinColumn({ name: 'productId' })
    product: Product;

    @Column({ type: 'int' })
    quantity: number;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    priceAtTime: string;
}
