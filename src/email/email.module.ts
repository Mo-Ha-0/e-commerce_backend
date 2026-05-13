import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../database/entities/order.entity';
import { EMAIL_QUEUE } from '../queues/queue.constants';
import { EmailProcessor } from './email.processor';
import { EmailService } from './email.service';

@Module({
    imports: [
        BullModule.registerQueue({ name: EMAIL_QUEUE }),
        TypeOrmModule.forFeature([Order]),
    ],
    providers: [EmailService, EmailProcessor],
    exports: [EmailService],
})
export class EmailModule {}
