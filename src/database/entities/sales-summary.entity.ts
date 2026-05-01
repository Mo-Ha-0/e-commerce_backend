import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    Unique,
} from 'typeorm';
import { Product } from './product.entity';

@Entity('sales_summary')
@Unique(['productId', 'summaryDate'])
export class SalesSummary {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    productId: string;

    @ManyToOne(() => Product, (product) => product.salesSummaries)
    @JoinColumn({ name: 'productId' })
    product: Product;

    @Column({ type: 'date' })
    summaryDate: string;

    @Column({ type: 'int', default: 0 })
    totalQuantity: number;

    @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
    totalRevenue: string;

    @CreateDateColumn()
    createdAt: Date;
}
