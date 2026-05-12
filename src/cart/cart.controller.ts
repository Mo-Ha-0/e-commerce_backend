import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    UseGuards,
} from '@nestjs/common';
import type { JwtUser } from '../auth/jwt-user.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

@UseGuards(JwtAuthGuard)
@Controller('cart')
export class CartController {
    constructor(private readonly cartService: CartService) {}

    @Get()
    getCart(@CurrentUser() user: JwtUser) {
        return this.cartService.findCart(user.userId);
    }

    @Post('items')
    addItem(@CurrentUser() user: JwtUser, @Body() dto: AddCartItemDto) {
        return this.cartService.addItem(user.userId, dto);
    }

    @Patch('items/:productId')
    updateItem(
        @CurrentUser() user: JwtUser,
        @Param('productId') productId: string,
        @Body() dto: UpdateCartItemDto,
    ) {
        return this.cartService.updateItem(user.userId, productId, dto);
    }

    @Delete('items/:productId')
    removeItem(
        @CurrentUser() user: JwtUser,
        @Param('productId') productId: string,
    ) {
        return this.cartService.removeItem(user.userId, productId);
    }

    @Delete()
    clear(@CurrentUser() user: JwtUser) {
        return this.cartService.clear(user.userId);
    }
}
