import { Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { JwtUser } from '../auth/jwt-user.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../database/entities/user.entity';
import { CheckoutFacade } from './facades/checkout.facade';
import { OrdersService } from './orders.service';
import { InvoicePdfService } from '../invoice/invoice-pdf.service';

@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
    constructor(
        private readonly ordersService: OrdersService,
        private readonly checkoutFacade: CheckoutFacade,
        private readonly invoicePdfService: InvoicePdfService,
    ) {}

    @Throttle({ default: { limit: 20, ttl: 60000 } })
    @Post()
    checkout(@CurrentUser() user: JwtUser) {
        return this.checkoutFacade.checkout(user.userId);
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

    @Get(':id/invoice')
    async downloadInvoice(
        @CurrentUser() user: JwtUser,
        @Param('id') orderId: string,
        @Res() res: Response,
    ) {
        const order = await this.ordersService.findOneForUser(
            orderId,
            user.userId,
            user.role,
        );

        if (!order.invoicePdfPath) {
            res.status(404).json({ message: 'Invoice not yet generated' });
            return;
        }

        const { stream, contentType } =
            await this.invoicePdfService.getPdfStream(order.invoicePdfPath);

        res.set({
            'Content-Type': contentType,
            'Content-Disposition': `attachment; filename="invoice-${orderId}.pdf"`,
        });

        stream.pipe(res);
    }
}
