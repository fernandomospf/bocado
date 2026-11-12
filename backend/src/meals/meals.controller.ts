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
import { CreateMealDto, DayParamDto, RangeQueryDto, UpdateMealItemDto } from './dto/meal.dto';
import { MealsService } from './meals.service';

@Controller()
export class MealsController {
  constructor(private readonly meals: MealsService) {}

  @Post('meals')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateMealDto) {
    return this.meals.create(user.id, dto);
  }

  @Delete('meals/:mealId')
  @HttpCode(204)
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

  @Delete('meals/:mealId/items/:itemId')
  @HttpCode(204)
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
