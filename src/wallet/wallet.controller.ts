import {
    Body,
    Controller,
    Get,
    Param,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import type { JwtUser } from '../auth/jwt-user.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../database/entities/user.entity';
import { DepositDto } from './dto/deposit.dto';
import { WalletTransactionsQueryDto } from './dto/wallet-transactions-query.dto';
import { WalletService } from './wallet.service';

@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletController {
    constructor(private readonly walletService: WalletService) {}

    @Get()
    getMine(@CurrentUser() user: JwtUser) {
        return this.walletService.getBalance(user.userId);
    }

    @Get('transactions')
    listMine(
        @CurrentUser() user: JwtUser,
        @Query() query: WalletTransactionsQueryDto,
    ) {
        return this.walletService.listTransactions(user.userId, query);
    }

    @UseGuards(RolesGuard)
    @Roles(UserRole.Admin, UserRole.SuperAdmin)
    @Get('admin/users/:userId')
    getUserBalance(@Param('userId') userId: string) {
        return this.walletService.getBalance(userId);
    }

    @UseGuards(RolesGuard)
    @Roles(UserRole.Admin, UserRole.SuperAdmin)
    @Get('admin/users/:userId/transactions')
    listUserTransactions(
        @Param('userId') userId: string,
        @Query() query: WalletTransactionsQueryDto,
    ) {
        return this.walletService.listTransactions(userId, query);
    }

    @UseGuards(RolesGuard)
    @Roles(UserRole.Admin, UserRole.SuperAdmin)
    @Post('admin/users/:userId/deposit')
    deposit(
        @CurrentUser() admin: JwtUser,
        @Param('userId') userId: string,
        @Body() dto: DepositDto,
    ) {
        return this.walletService.deposit(userId, admin.userId, dto);
    }
}
