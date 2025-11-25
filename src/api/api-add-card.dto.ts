import { cardLocation, ICard } from '@thefirstspine/types-game';
import { IsString, IsObject, IsNumber, IsOptional, IsEnum } from 'class-validator';

export class ApiAddCardDto {
  @IsNumber()
  @IsOptional()
  user?: number = undefined;

  @IsEnum(['deck', 'hand', 'board', 'discard', 'exile'])
  @IsOptional()
  location?: cardLocation = undefined;

  @IsObject()
  @IsOptional()
  coords?: {x: number, y: number} = undefined;

  @IsObject()
  card: ICard;
}
