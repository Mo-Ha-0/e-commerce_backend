import {
    IsEmail,
    IsEnum,
    IsOptional,
    IsString,
    MinLength,
} from 'class-validator';
import { UserRole } from '../../database/entities/user.entity';

export class RegisterAdminDto {
    @IsEmail()
    email: string;

    @IsString()
    @MinLength(8)
    password: string;

    // @IsOptional()
    // @IsEnum(UserRole)
    // role: UserRole;
}
