import { Module } from '@nestjs/common';
import { ProfileModule } from '../profile/profile.module';
import { MealsController } from './meals.controller';
import { MealsService } from './meals.service';
import { SharedMealsController } from './shared-meals.controller';
import { SharedMealsService } from './shared-meals.service';

@Module({
  imports: [ProfileModule],
  controllers: [MealsController, SharedMealsController],
  providers: [MealsService, SharedMealsService],
  exports: [MealsService],
})
export class MealsModule {}
