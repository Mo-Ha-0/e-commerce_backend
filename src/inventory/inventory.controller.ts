import {
    Body,
    Controller,
    Get,
    Param,
    Patch,
    Post,
    Query,
    Res,
    UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { JwtUser } from '../auth/jwt-user.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../database/entities/user.entity';
import { RestockDto } from './dto/restock.dto';
import { UpdateStockDto } from './dto/update-stock.dto';
import { InventoryService } from './inventory.service';
import { BatchSummaryService } from './services/batch-summary.service';
import { SalesSummaryPdfService } from './services/sales-summary-pdf.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.Admin, UserRole.SuperAdmin)
@Controller('inventory')
export class InventoryController {
    constructor(
        private readonly inventoryService: InventoryService,
        private readonly batchSummaryService: BatchSummaryService,
        private readonly salesSummaryPdfService: SalesSummaryPdfService,
    ) {}

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

    @Post('batch-summary')
    async triggerBatchSummary(
        @Query('year') year: string,
        @Query('month') month: string,
    ) {
        const result =
            await this.batchSummaryService.enqueueBatchSummaryForMonth(
                Number(year),
                Number(month),
            );
        return {
            message: `Batch summary enqueued — ${result.enqueued} chunk jobs created`,
            ...result,
        };
    }

    @Get('sales-summary-pdf')
    async downloadSalesSummaryPdf(@Res() res: Response) {
        const key = await this.salesSummaryPdfService.getLatestPdfKey();

        if (!key) {
            res.status(404).json({
                message:
                    'No sales summary PDF available yet. It is generated automatically on the 1st of each month.',
            });
            return;
        }

        const filename = key.split('/').pop();

        try {
            const { stream, contentType } =
                await this.salesSummaryPdfService.getPdfStream(key);

            res.set({
                'Content-Type': contentType,
                'Content-Disposition': `attachment; filename="${filename}"`,
            });

            stream.pipe(res);
        } catch {
            res.status(404).json({
                message: 'Sales summary PDF not found.',
            });
        }
    }
}
