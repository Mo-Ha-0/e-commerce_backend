import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { LOW_STOCK_QUEUE } from '../queues/queue.constants';
import { LowStockNotificationService } from './low-stock-notification.service';
import { LowStockProcessor } from './low-stock.processor';

@Module({
    imports: [BullModule.registerQueue({ name: LOW_STOCK_QUEUE }), EmailModule],
    providers: [LowStockNotificationService, LowStockProcessor],
    exports: [LowStockNotificationService],
})
export class NotificationsModule {}
