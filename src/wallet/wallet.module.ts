import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../database/entities/user.entity';
import { WalletTransaction } from '../database/entities/wallet-transaction.entity';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

@Module({
    imports: [TypeOrmModule.forFeature([User, WalletTransaction])],
    controllers: [WalletController],
    providers: [WalletService],
})
export class WalletModule {}
