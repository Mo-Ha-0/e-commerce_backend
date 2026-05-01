import {
    Column,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    Unique,
    UpdateDateColumn,
} from 'typeorm';
import { Product } from './product.entity';
import { User } from './user.entity';

@Entity('cart_items')
@Unique(['userId', 'productId'])
export class CartItem {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    userId: string;

    @ManyToOne(() => User, (user) => user.cartItems, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'userId' })
    user: User;

    @Column()
    productId: string;

    @ManyToOne(() => Product, (product) => product.cartItems, {
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'productId' })
    product: Product;

    @Column({ type: 'int' })
    quantity: number;

    @UpdateDateColumn()
    updatedAt: Date;
}
