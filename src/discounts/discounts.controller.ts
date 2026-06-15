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
import { DiscountsService } from './discounts.service';
import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { UserRole } from 'src/database/entities/user.entity';
import { CreateDiscountDto } from './dto/create-discount.dto';
import { UpdateDiscountDto } from './dto/update-discount.dto';

@Controller('discounts')
export class DiscountsController {
    constructor(private readonly discountsService: DiscountsService) {}

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.Admin, UserRole.SuperAdmin)
    @Get()
    findAll() {
        return this.discountsService.findAll();
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.Admin, UserRole.SuperAdmin)
    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.discountsService.findOne(id);
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.Admin, UserRole.SuperAdmin)
    @Post()
    create(@Body() dto: CreateDiscountDto) {
        return this.discountsService.create(dto);
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.Admin, UserRole.SuperAdmin)
    @Patch(':id')
    update(@Param('id') id: string, @Body() dto: UpdateDiscountDto) {
        return this.discountsService.update(id, dto);
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.Admin, UserRole.SuperAdmin)
    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.discountsService.remove(id);
    }
    
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.Admin, UserRole.SuperAdmin)
    @Post('actions/pre-warm')
    preWarmCache() {
        return this.discountsService.preWarmCache();
    }
}
