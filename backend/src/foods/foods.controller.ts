import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateFoodDto, SearchFoodsQueryDto } from './dto/food.dto';
import { FoodsService } from './foods.service';

@Controller('foods')
export class FoodsController {
  constructor(private readonly foods: FoodsService) {}

  /** Histórico do usuário, alimentos próprios e TACO, nessa ordem. */
  @Get('search')
  search(@CurrentUser() user: AuthUser, @Query() { q, limit }: SearchFoodsQueryDto) {
    return this.foods.search(user.id, q, limit);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateFoodDto) {
    return this.foods.create(user.id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.foods.remove(user.id, id);
  }
}
