import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateFoodDto, CreateProductDto, ReportFoodDto, SearchFoodsQueryDto } from './dto/food.dto';
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

  /** Produto lido do rótulo e revisado: entra no acervo compartilhado. */
  @Post('products')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  createProduct(@CurrentUser() user: AuthUser, @Body() dto: CreateProductDto) {
    return this.foods.createProduct(user.id, dto);
  }

  /** "Informar erro" num produto do acervo. */
  @Post(':id/report')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  report(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() { reason }: ReportFoodDto) {
    return this.foods.report(user.id, id, reason);
  }

  /** Situação do selo "Verificado" para a pessoa (contagem, se já confirmou, se o produto é dela). */
  @Get(':id/verification')
  verification(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.foods.verification(user.id, id);
  }

  /** "Os valores conferem com o rótulo": uma confirmação por pessoa; o criador do produto não conta. */
  @Post(':id/confirm')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  confirm(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.foods.confirm(user.id, id);
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
