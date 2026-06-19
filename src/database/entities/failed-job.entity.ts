import {
    Column,
    CreateDateColumn,
    Entity,
    PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('failed_jobs')
export class FailedJob {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    orderId: string;

    @Column()
    jobType: string;

    @Column({ type: 'text' })
    error: string;

    @Column({ default: 0 })
    retryCount: number;

    @Column({ default: true })
    pendingRetry: boolean;

    @CreateDateColumn()
    createdAt: Date;
}
