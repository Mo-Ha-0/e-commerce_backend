import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class RestockDto {
    @IsInt()
    @Min(1)
    quantity: number;

    @IsOptional()
    @IsString()
    reason?: string;
}
