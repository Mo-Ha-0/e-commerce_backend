import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import type { JwtUser } from './jwt-user.type';
import { RegisterAdminDto } from './dto/registerAdmin.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from 'src/database/entities/user.entity';
import { RolesGuard } from 'src/common/guards/roles.guard';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Post('register')
    register(@Body() dto: RegisterDto) {
        return this.authService.register(dto);
    }

    @Roles(UserRole.SuperAdmin)
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Post('register-admin')
    register_Admin(@Body() dto: RegisterAdminDto) {
        return this.authService.register_Admin(dto);
    }

    @Throttle({ default: { limit: 5, ttl: 60000 } })
    @Post('login')
    login(@Body() dto: LoginDto) {
        return this.authService.login(dto);
    }

    @Roles(UserRole.SuperAdmin, UserRole.Admin, UserRole.Customer)
    @UseGuards(JwtAuthGuard, RolesGuard)
    // @UseGuards(JwtAuthGuard)
    @Get('me')
    me(@CurrentUser() user: JwtUser) {
        return this.authService.me(user);
    }
}
