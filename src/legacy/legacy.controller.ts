import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { IWizard, Wizard, WizardDocument } from './wizard.schema';
import { Model } from 'mongoose';

@Controller('legacy')
export class LegacyController {

  constructor(
    @InjectModel(Wizard.name) private wizardModel: Model<WizardDocument>,
  ) {}

  public async getWizard(wizardId: number): Promise<Wizard | null> {
    return this.wizardModel.findOne({ id: wizardId }).exec();
  }

  @Get('wizards/:id')
  async single(@Param('id') id: number): Promise<IWizard> {
    const wizard: IWizard|null = await this.wizardModel.findOne({id}).exec();
    if (!wizard) {
      throw new NotFoundException();
    }
    return wizard;
  }

}
