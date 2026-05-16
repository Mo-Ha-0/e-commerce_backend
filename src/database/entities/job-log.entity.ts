import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('job_logs')
export class JobLog {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    jobName: string;

    @Column({ type: 'timestamptz' })
    startAt: Date;

    @Column({ type: 'timestamptz', nullable: true })
    endAt?: Date;

    @Column({ type: 'int', default: 0 })
    processedCount: number;

    @Column({ type: 'text', nullable: true })
    details?: string;

    @CreateDateColumn()
    createdAt: Date;
}
