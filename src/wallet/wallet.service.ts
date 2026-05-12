import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { centsToMoney, moneyToCents } from '../common/money';
import { User } from '../database/entities/user.entity';
import {
    WalletTransaction,
    WalletTransactionReason,
    WalletTransactionType,
} from '../database/entities/wallet-transaction.entity';
import { DepositDto } from './dto/deposit.dto';
import { WalletTransactionsQueryDto } from './dto/wallet-transactions-query.dto';

@Injectable()
export class WalletService {
    constructor(
        @InjectDataSource()
        private readonly dataSource: DataSource,
        @InjectRepository(User)
        private readonly usersRepository: Repository<User>,
        @InjectRepository(WalletTransaction)
        private readonly walletTransactionsRepository: Repository<WalletTransaction>,
    ) {}

    async getBalance(userId: string) {
        const user = await this.usersRepository.findOne({
            where: { id: userId },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        return {
            userId: user.id,
            balance: user.balance,
        };
    }

    async listTransactions(userId: string, query: WalletTransactionsQueryDto) {
        await this.ensureUserExists(userId);

        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const [transactions, total] =
            await this.walletTransactionsRepository.findAndCount({
                where: { userId },
                order: { createdAt: 'DESC' },
                skip: (page - 1) * limit,
                take: limit,
            });

        return {
            data: transactions,
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    async deposit(userId: string, performedByUserId: string, dto: DepositDto) {
        let amountCents: number;

        try {
            amountCents = moneyToCents(dto.amount);
        } catch {
            throw new BadRequestException(
                'Amount must be positive with up to 2 decimals',
            );
        }

        if (amountCents <= 0) {
            throw new BadRequestException(
                'Amount must be positive with up to 2 decimals',
            );
        }

        return this.dataSource.transaction(async (manager) => {
            const user = await manager.getRepository(User).findOne({
                where: { id: userId },
                lock: { mode: 'pessimistic_write' },
            });

            if (!user) {
                throw new NotFoundException('User not found');
            }

            const balanceBeforeCents = moneyToCents(user.balance);
            const balanceAfterCents = balanceBeforeCents + amountCents;

            user.balance = centsToMoney(balanceAfterCents);
            await manager.getRepository(User).save(user);

            const transaction = await manager
                .getRepository(WalletTransaction)
                .save(
                    manager.getRepository(WalletTransaction).create({
                        userId: user.id,
                        type: WalletTransactionType.Credit,
                        reason: WalletTransactionReason.AdminDeposit,
                        amount: centsToMoney(amountCents),
                        balanceBefore: centsToMoney(balanceBeforeCents),
                        balanceAfter: user.balance,
                        performedByUserId,
                        note: dto.note,
                    }),
                );

            return {
                userId: user.id,
                balance: user.balance,
                transaction,
            };
        });
    }

    private async ensureUserExists(userId: string) {
        const exists = await this.usersRepository.exists({
            where: { id: userId },
        });

        if (!exists) {
            throw new NotFoundException('User not found');
        }
    }
}
