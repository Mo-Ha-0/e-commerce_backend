import {
    Column,
    CreateDateColumn,
    Entity,
    PrimaryGeneratedColumn,
} from 'typeorm';

export enum DiscountAuditAction {
    CREATED = 'CREATED',
    UPDATED = 'UPDATED',
    DELETED = 'DELETED',
}

@Entity('discount_audit_logs')
export class DiscountAuditLog {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    discountId: string;

    @Column()
    discountName: string;

    @Column({
        type: 'enum',
        enum: DiscountAuditAction,
    })
    action: DiscountAuditAction;

    @Column({ type: 'jsonb', nullable: true })
    changes: any;

    @Column({ nullable: true })
    adminId: string; // If you want to track which admin made the change

    @CreateDateColumn()
    createdAt: Date;
}
