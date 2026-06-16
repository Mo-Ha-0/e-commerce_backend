import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';

export enum DiscountType {
    PERCENTAGE = 'PERCENTAGE',
    FIXED = 'FIXED',
}

@Entity('discounts')
export class Discount {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string;

    @Column({
        type: 'enum',
        enum: DiscountType,
        default: DiscountType.PERCENTAGE,
    })
    type: DiscountType;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    value: string;

    @Column({ nullable: true })
    @Index()
    productId: string | null;

    @Column({ default: true })
    @Index()
    isActive: boolean;

    @Column({ type: 'timestamp', nullable: true })
    startDate: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    endDate: Date | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
