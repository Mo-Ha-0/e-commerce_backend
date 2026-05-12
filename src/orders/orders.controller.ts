import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { JwtUser } from '../auth/jwt-user.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../database/entities/user.entity';
import { OrdersService } from './orders.service';

@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
    constructor(private readonly ordersService: OrdersService) {}

    @Throttle({ default: { limit: 20, ttl: 60000 } })
    @Post()
    checkout(@CurrentUser() user: JwtUser) {
        return this.ordersService.checkout(user.userId);
    }

    @Get()
    findMine(@CurrentUser() user: JwtUser) {
        return this.ordersService.findMine(user.userId);
    }

    @UseGuards(RolesGuard)
    @Roles(UserRole.Admin, UserRole.SuperAdmin)
    @Get('admin')
    findAll() {
        return this.ordersService.findAll();
    }

    @Get(':id')
    findOne(@CurrentUser() user: JwtUser, @Param('id') orderId: string) {
        return this.ordersService.findOneForUser(
            orderId,
            user.userId,
            user.role,
        );
    }
}
