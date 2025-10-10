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

  @Get('wizards')
  async single(): Promise<any> {
    const wizard = await this.wizardModel.find();
    return wizard;
  }

}
