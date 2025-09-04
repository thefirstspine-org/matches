import { IsString, IsOptional, IsIn, IsNumber, Min, Max, IsArray } from 'class-validator';
import { IGameCard } from '@thefirstspine/types-matches';

export class ApiCreateQueueDto {
  @IsString()
  @IsOptional()
  key: string;

  @IsNumber()
  @Min(0.1)
  @Max(9999)
  @IsOptional()
  expirationTimeModifier?: number;

  @IsArray()
  @IsOptional()
  cards?: IGameCard[];

  @IsArray()
  @IsOptional()
  coords?: {x: number, y: number}[];
}
