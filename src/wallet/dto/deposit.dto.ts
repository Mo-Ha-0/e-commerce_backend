import {
    IsNumber,
    IsOptional,
    IsString,
    MaxLength,
    Min,
} from 'class-validator';

export class DepositDto {
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0.01)
    amount: number;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    note?: string;
}
