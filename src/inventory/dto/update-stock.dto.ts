import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateStockDto {
    @IsInt()
    @Min(0)
    stock: number;

    @IsOptional()
    @IsString()
    reason?: string;
}
