import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdaptiveService } from './adaptive.service';
import { AdaptiveHistoryQueryDto, AdaptiveStatusQueryDto, ApplyAdaptiveDto, DismissAdaptiveDto } from './dto/adaptive.dto';

/** Meta adaptativa: sugere, nunca aplica sozinha. Sem IA. */
@Controller('adaptive')
export class AdaptiveController {
  constructor(private readonly adaptive: AdaptiveService) {}

  @Get('status')
  status(@CurrentUser() user: AuthUser, @Query() { today }: AdaptiveStatusQueryDto) {
    return this.adaptive.status(user.id, today);
  }

  @Post('apply')
  @HttpCode(200)
  apply(@CurrentUser() user: AuthUser, @Body() dto: ApplyAdaptiveDto) {
    return this.adaptive.apply(user.id, dto);
  }

  @Post('dismiss')
  @HttpCode(200)
  dismiss(@CurrentUser() user: AuthUser, @Body() dto: DismissAdaptiveDto) {
    return this.adaptive.dismiss(user.id, dto);
  }

  @Get('history')
  history(@CurrentUser() user: AuthUser, @Query() { limit }: AdaptiveHistoryQueryDto) {
    return this.adaptive.history(user.id, limit);
  }
}
