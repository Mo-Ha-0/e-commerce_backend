import {
    IsBoolean,
    IsDateString,
    IsEnum,
    IsNumber,
    IsOptional,
    IsString,
    IsUUID,
    Min,
} from 'class-validator';
import { DiscountType } from '../../database/entities/discount.entity';

export class CreateDiscountDto {
    @IsString()
    name: string;

    @IsEnum(DiscountType)
    type: DiscountType;

    @IsNumber()
    @Min(0.01)
    value: number;

    @IsOptional()
    @IsUUID()
    productId?: string;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @IsOptional()
    @IsDateString()
    startDate?: string;

    @IsOptional()
    @IsDateString()
    endDate?: string;
}
