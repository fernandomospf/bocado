import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { AiUsageAdminService } from './ai-usage-admin.service';
import { AiLimitDto, AiUsageQueryDto, CreateInviteDto, WaitlistQueryDto } from './dto/admin.dto';

/** Painel do beta. Tudo atrás do AdminGuard: quem não é admin recebe 403. */
@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly ai: AiUsageAdminService,
  ) {}

  @Get('me')
  me() {
    return { admin: true };
  }

  @Get('stats')
  stats() {
    return this.admin.stats();
  }

  @Get('waitlist')
  waitlist(@Query() { status, page }: WaitlistQueryDto) {
    return this.admin.waitlist(status, page);
  }

  @Post('waitlist/:id/invite')
  @HttpCode(201)
  invite(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.admin.inviteFromWaitlist(user.id, id);
  }

  @Delete('waitlist/:id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.removeFromWaitlist(id);
  }

  /** Uso e custo da IA (agregado: sem conteúdo, e-mails mascarados). */
  @Get('ai/usage')
  aiUsage(@Query() { days }: AiUsageQueryDto) {
    return this.ai.usage(days ?? 30);
  }

  /** Fator dos limites de IA de uma pessoa (0 = bloqueada, 2 = dobro). */
  @Patch('users/:id/ai-limit')
  setAiLimit(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AiLimitDto) {
    return this.ai.setLimitFactor(id, dto.factor);
  }

  @Get('invites')
  invites() {
    return this.admin.invites();
  }

  @Post('invites')
  @HttpCode(201)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateInviteDto) {
    return this.admin.createInvite(user.id, dto);
  }

  @Post('invites/:id/revoke')
  @HttpCode(200)
  revoke(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.revokeInvite(id);
  }
}
