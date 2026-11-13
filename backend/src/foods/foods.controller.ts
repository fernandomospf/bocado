import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
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

  /**
   * Produto pelo código de barras: acervo local → Open Food Facts (salvo no acervo) → não encontrado.
   * Limite próprio: cada código novo pode virar uma consulta externa.
   */
  @Get('barcode/:code')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  barcode(@Param('code') code: string) {
    return this.foods.lookupBarcode(code);
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
