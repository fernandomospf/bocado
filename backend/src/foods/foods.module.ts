import { Module } from '@nestjs/common';
import { RecipesModule } from '../recipes/recipes.module';
import { FoodsController } from './foods.controller';
import { FoodsService } from './foods.service';

@Module({ imports: [RecipesModule], controllers: [FoodsController], providers: [FoodsService] })
export class FoodsModule {}
