import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AcceptOfferDto, CreateSharedMealDto } from './dto/shared-meal.dto';
import { SharedMealsService } from './shared-meals.service';

@Controller()
export class SharedMealsController {
  constructor(private readonly shared: SharedMealsService) {}

  /** Registra uma refeição e divide as porções com a casa (oferta ou, se a pessoa aceita sempre, direto no diário). */
  @Post('meals/shared')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSharedMealDto) {
    return this.shared.create(user.id, dto);
  }

  @Get('shared-meals/offers')
  offers(@CurrentUser() user: AuthUser) {
    return this.shared.listOffers(user.id);
  }

  @Post('shared-meals/offers/:id/accept')
  @HttpCode(200)
  accept(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AcceptOfferDto) {
    return this.shared.accept(user.id, id, dto);
  }

  @Delete('shared-meals/offers/:id')
  @HttpCode(204)
  dismiss(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.shared.dismiss(user.id, id);
  }
}
