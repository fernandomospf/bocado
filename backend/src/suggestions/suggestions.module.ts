import { Module } from '@nestjs/common';
import { AnalysisModule } from '../analysis/analysis.module';
import { FoodsModule } from '../foods/foods.module';
import { MealsModule } from '../meals/meals.module';
import { SuggestionsController } from './suggestions.controller';
import { SuggestionsService } from './suggestions.service';

@Module({
  imports: [AnalysisModule, MealsModule, FoodsModule],
  controllers: [SuggestionsController],
  providers: [SuggestionsService],
})
export class SuggestionsModule {}
