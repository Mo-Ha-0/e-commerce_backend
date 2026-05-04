import {
    Body,
    Controller,
    Get,
    Param,
    Patch,
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
import { RestockDto } from './dto/restock.dto';
import { UpdateStockDto } from './dto/update-stock.dto';
import { InventoryService } from './inventory.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.Admin, UserRole.SuperAdmin)
@Controller('inventory')
export class InventoryController {
    constructor(private readonly inventoryService: InventoryService) {}

    @Patch(':productId')
    updateStock(
        @CurrentUser() user: JwtUser,
        @Param('productId') productId: string,
        @Body() dto: UpdateStockDto,
    ) {
        return this.inventoryService.updateStock(productId, user.userId, dto);
    }

    @Post(':productId/restock')
    restock(
        @CurrentUser() user: JwtUser,
        @Param('productId') productId: string,
        @Body() dto: RestockDto,
    ) {
        return this.inventoryService.restock(productId, user.userId, dto);
    }

    @Get('low-stock')
    lowStock(@Query('threshold') threshold = '5') {
        return this.inventoryService.findLowStock(Number(threshold));
    }

    @Get('logs')
    logs() {
        return this.inventoryService.findLogs();
    }
}
