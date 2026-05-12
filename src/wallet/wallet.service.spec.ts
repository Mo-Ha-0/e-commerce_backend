import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { User, UserRole } from '../database/entities/user.entity';
import {
    WalletTransaction,
    WalletTransactionReason,
    WalletTransactionType,
} from '../database/entities/wallet-transaction.entity';
import { WalletService } from './wallet.service';

describe('WalletService', () => {
    it('credits a user balance and writes a ledger transaction', async () => {
        const user: User = {
            id: 'customer-id',
            email: 'customer@example.com',
            passwordHash: 'hash',
            role: UserRole.Customer,
            balance: '10.00',
            createdAt: new Date(),
            cartItems: [],
            orders: [],
            inventoryLogs: [],
            walletTransactions: [],
            performedWalletTransactions: [],
        };

        const userRepository = {
            findOne: jest.fn().mockResolvedValue(user),
            save: jest.fn().mockImplementation(async (value: User) => value),
        };
        const walletTransactionRepository = {
            create: jest.fn().mockImplementation((value) => value),
            save: jest
                .fn()
                .mockImplementation(async (value) => ({
                    id: 'wallet-transaction-id',
                    ...value,
                })),
        };
        const dataSource = {
            transaction: jest.fn((callback) =>
                callback({
                    getRepository: (entity: unknown) =>
                        entity === User
                            ? userRepository
                            : walletTransactionRepository,
                }),
            ),
        } as unknown as DataSource;

        const service = new WalletService(
            dataSource,
            {} as never,
            {} as never,
        );

        const result = await service.deposit('customer-id', 'admin-id', {
            amount: 25.5,
            note: 'manual test funds',
        });

        expect(user.balance).toBe('35.50');
        expect(result.balance).toBe('35.50');
        expect(walletTransactionRepository.save).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: 'customer-id',
                type: WalletTransactionType.Credit,
                reason: WalletTransactionReason.AdminDeposit,
                amount: '25.50',
                balanceBefore: '10.00',
                balanceAfter: '35.50',
                performedByUserId: 'admin-id',
            }),
        );
    });

    it('rejects non-positive deposits before opening a transaction', async () => {
        const dataSource = {
            transaction: jest.fn(),
        } as unknown as DataSource;
        const service = new WalletService(
            dataSource,
            {} as never,
            {} as never,
        );

        await expect(
            service.deposit('customer-id', 'admin-id', { amount: 0 }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(dataSource.transaction).not.toHaveBeenCalled();
    });
});
