import { Module } from '@nestjs/common';
import { ProfileModule } from '../profile/profile.module';
import { MealsController } from './meals.controller';
import { MealsService } from './meals.service';

@Module({
  imports: [ProfileModule],
  controllers: [MealsController],
  providers: [MealsService],
})
export class MealsModule {}
