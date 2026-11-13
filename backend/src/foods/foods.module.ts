import { Module } from '@nestjs/common';
import { RecipesModule } from '../recipes/recipes.module';
import { FoodsController } from './foods.controller';
import { FoodsService } from './foods.service';
import { OffClient } from './off.client';

@Module({ imports: [RecipesModule], controllers: [FoodsController], providers: [FoodsService, OffClient] })
export class FoodsModule {}
