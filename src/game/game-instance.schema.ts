import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { IGameAction, IGameActionPassed, IGameCard, IGameInstance, IGameInteraction, IGameResult, IGameUser } from '@thefirstspine/types-matches';
import { Document } from 'mongoose';

export type GameInstanceDocument = IGameInstance & Document;

@Schema()
export class GameInstance implements IGameInstance {
  @Prop()
  status: 'active' | 'ended' | 'closed' | 'conceded';

  @Prop()
  createdAt: Date;

  @Prop()
  id: number;

  @Prop()
  queueKey: string;

  @Prop()
  gameUsers: IGameUser[];

  @Prop()
  cards: IGameCard[];

  @Prop({
    type: Object
  })
  actions: {
      current: Array<IGameAction<IGameInteraction>>;
      previous: Array<IGameActionPassed<IGameInteraction>>;
  };

  @Prop()
  result?: IGameResult[];

  @Prop()
  realm?: string;

  @Prop()
  queue: string;

  @Prop()
  expirationTimeModifier?: number;
}

export const GameInstanceSchema = SchemaFactory.createForClass(GameInstance);
