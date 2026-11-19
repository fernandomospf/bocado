import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  CreateMealDto,
  DayParamDto,
  LastLogQueryDto,
  MoveMealItemDto,
  RangeQueryDto,
  RecentQueryDto,
  RepeatMealDto,
  RestoreMealDto,
  UpdateMealItemDto,
} from './dto/meal.dto';
import { MealsService } from './meals.service';

@Controller()
export class MealsController {
  constructor(private readonly meals: MealsService) {}

  @Post('meals')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateMealDto) {
    return this.meals.create(user.id, dto);
  }

  /** Refeições recentes distintas (últimos 30 dias), com a frequência. Declarada antes das rotas com :mealId. */
  @Get('meals/recent')
  recent(@CurrentUser() user: AuthUser, @Query() { type, limit }: RecentQueryDto) {
    return this.meals.recent(user.id, type, limit);
  }

  /**
   * Há quantos dias a pessoa não registra nada (dia local `today`). Alimenta o card "Que bom te ver por aqui".
   * Só informa: nenhuma notificação, e-mail ou cobrança sai daqui.
   */
  @Get('meals/last-log')
  lastLog(@CurrentUser() user: AuthUser, @Query() { today }: LastLogQueryDto) {
    return this.meals.lastLog(user.id, today);
  }

  /** Duplica uma refeição sua em outra data (ou no mesmo dia, em outro tipo). */
  @Post('meals/:mealId/repeat')
  repeat(@CurrentUser() user: AuthUser, @Param('mealId', ParseUUIDPipe) mealId: string, @Body() dto: RepeatMealDto) {
    return this.meals.repeat(user.id, mealId, dto);
  }

  /** Desfaz uma exclusão a partir do snapshot devolvido pelo DELETE (até 10 minutos depois). */
  @Post('meals/restore')
  @HttpCode(200)
  restore(@CurrentUser() user: AuthUser, @Body() dto: RestoreMealDto) {
    return this.meals.restore(user.id, dto.snapshot);
  }

  /** Responde com o snapshot do que foi apagado, para o app oferecer "Desfazer". */
  @Delete('meals/:mealId')
  remove(@CurrentUser() user: AuthUser, @Param('mealId', ParseUUIDPipe) mealId: string) {
    return this.meals.remove(user.id, mealId);
  }

  @Patch('meals/:mealId/items/:itemId')
  updateItem(
    @CurrentUser() user: AuthUser,
    @Param('mealId', ParseUUIDPipe) mealId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateMealItemDto,
  ) {
    return this.meals.updateItem(user.id, mealId, itemId, dto);
  }

  /** Move o alimento para outra refeição/dia (cria a refeição de destino se preciso). */
  @Post('meals/:mealId/items/:itemId/move')
  @HttpCode(200)
  moveItem(
    @CurrentUser() user: AuthUser,
    @Param('mealId', ParseUUIDPipe) mealId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: MoveMealItemDto,
  ) {
    return this.meals.moveItem(user.id, mealId, itemId, dto);
  }

  /** Responde com o snapshot (inclui a refeição, se ela tiver ficado vazia e sido apagada). */
  @Delete('meals/:mealId/items/:itemId')
  removeItem(
    @CurrentUser() user: AuthUser,
    @Param('mealId', ParseUUIDPipe) mealId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.meals.removeItem(user.id, mealId, itemId);
  }

  /** Resumo de um dia: metas, totais e refeições. */
  @Get('days/:date')
  day(@CurrentUser() user: AuthUser, @Param() { date }: DayParamDto) {
    return this.meals.day(user.id, date);
  }

  /** Totais por dia num intervalo (histórico). */
  @Get('days')
  range(@CurrentUser() user: AuthUser, @Query() { from, to }: RangeQueryDto) {
    return this.meals.range(user.id, from, to);
  }
}
