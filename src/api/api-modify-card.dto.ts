import { cardLocation, ICard } from '@thefirstspine/types-game';
import { IsString, IsObject, IsNumber, IsOptional, IsEnum } from 'class-validator';

export class ApiModifyCardDto {
  @IsString()
  id: string;

  @IsEnum(['deck', 'hand', 'board', 'discard', 'exile'])
  @IsOptional()
  location?: cardLocation = undefined;

  @IsObject()
  @IsOptional()
  coords?: {x: number, y: number} = undefined;
}
