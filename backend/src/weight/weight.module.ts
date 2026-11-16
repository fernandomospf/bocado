import { Module } from '@nestjs/common';
import { WaterModule } from '../water/water.module';
import { WeightController } from './weight.controller';
import { WeightService } from './weight.service';

@Module({ imports: [WaterModule], controllers: [WeightController], providers: [WeightService] })
export class WeightModule {}
