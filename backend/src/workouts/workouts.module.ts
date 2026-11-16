import { Module } from '@nestjs/common';
import { WaterModule } from '../water/water.module';
import { WorkoutsController } from './workouts.controller';
import { WorkoutsService } from './workouts.service';

@Module({ imports: [WaterModule], controllers: [WorkoutsController], providers: [WorkoutsService] })
export class WorkoutsModule {}
