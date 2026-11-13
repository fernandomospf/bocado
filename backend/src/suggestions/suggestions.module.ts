import { Module } from '@nestjs/common';
import { AnalysisModule } from '../analysis/analysis.module';
import { MealsModule } from '../meals/meals.module';
import { RecipesModule } from '../recipes/recipes.module';
import { SuggestionsController } from './suggestions.controller';
import { SuggestionsService } from './suggestions.service';

@Module({
  imports: [AnalysisModule, MealsModule, RecipesModule],
  controllers: [SuggestionsController],
  providers: [SuggestionsService],
})
export class SuggestionsModule {}
