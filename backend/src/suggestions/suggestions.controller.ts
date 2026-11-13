import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CloseDayAiDto, CloseDayQueryDto, LogSuggestionDto } from './dto/suggestions.dto';
import { SuggestionsService } from './suggestions.service';

@Controller('suggestions')
export class SuggestionsController {
  constructor(private readonly suggestions: SuggestionsService) {}

  /** "Para fechar o dia": só a base local. Nunca chama a IA; indica canAskAi quando ela pode ajudar. */
  @Get('close-day')
  closeDay(@CurrentUser() user: AuthUser, @Query() { date }: CloseDayQueryDto) {
    return this.suggestions.closeDay(user.id, date);
  }

  /** Fallback com a IA, com cache compartilhado e limite diário por usuário. */
  @Post('close-day/ai')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  closeDayWithAi(@CurrentUser() user: AuthUser, @Body() { date, meal }: CloseDayAiDto) {
    return this.suggestions.closeDayWithAi(user.id, date, meal ?? 'DINNER');
  }

  /** Registra a sugestão escolhida como refeição. */
  @Post('log')
  log(@CurrentUser() user: AuthUser, @Body() dto: LogSuggestionDto) {
    return this.suggestions.log(user.id, dto);
  }
}
