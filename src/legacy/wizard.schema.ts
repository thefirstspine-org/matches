// @deprecated
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ILocalized } from '@thefirstspine/types-game';
import { Document } from 'mongoose';

export interface IWizardHistoryItem {
  gameId: number;
  victory: boolean;
  gameTypeId: string;
  timestamp: number;
}

export interface IWizardItem {
  name: string;
  num: number;
}

export interface IUserQuest extends IQuest {
  objectiveCurrent: number;
}

export interface IQuest extends IBaseEntity {
  id: string;
  objectiveType: string;
  objectiveTarget: number;
  loots: ILoot[];
}

export interface IBaseEntity {
  id: string;
  name: ILocalized;
  description: ILocalized;
}

export interface ILoot {
  name: string;
  num: number;
}

export interface IWizard {
  id: number;
  version: 1.0;
  name: string;
  items: IWizardItem[];
  history: IWizardHistoryItem[];
  purchases: string[];
  avatar: string;
  title: string;
  triumphs: string[];
  friends: number[];
  quests: string[];
  questsProgress: IUserQuest[];
}

export type WizardDocument = IWizard & Document;

@Schema()
export class Wizard implements IWizard {
  @Prop()
  id: number;

  @Prop()
  version: 1.0;

  @Prop()
  name: string;

  @Prop()
  items: IWizardItem[];

  @Prop()
  history: IWizardHistoryItem[];

  @Prop()
  purchases: string[];

  @Prop()
  avatar: string;

  @Prop()
  title: string;

  @Prop()
  triumphs: string[];

  @Prop()
  friends: number[];

  @Prop()
  quests: string[];

  @Prop()
  questsProgress: IUserQuest[];
}

export const WizardSchema = SchemaFactory.createForClass(Wizard);
