import { Controller, Get } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AiQuotaService } from './ai-quota.service';

@Controller('ai')
export class AiUsageController {
  constructor(private readonly quota: AiQuotaService) {}

  /** Cotas de IA do próprio usuário (usado, limite e quando voltam). */
  @Get('quota')
  get(@CurrentUser() user: AuthUser) {
    return this.quota.quota(user.id);
  }
}
