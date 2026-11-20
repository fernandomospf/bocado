import { Body, Controller, Delete, ForbiddenException, Get, Header, HttpCode, Param, Post, Req, Res, StreamableFile } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { CreateShareDto, ShareIdParamDto, ShareTokenParamDto, UnlockShareDto } from './dto/reports.dto';
import { pdfFilename, renderNutritionistPdf } from './nutritionist.pdf';
import { cookiePaths, DEVICE_COOKIE, MSG } from './share';
import { ReportSharesService } from './shares.service';

/** Links do relatório (dono, com sessão). O código sai só na resposta da criação e nunca é registrado em log. */
@Controller('reports/shares')
export class ReportSharesController {
  constructor(private readonly shares: ReportSharesService) {}

  @Post()
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateShareDto) {
    return this.shares.create(user.id, { from: dto.from, to: dto.to, expiresInDays: dto.expiresInDays, maxDevices: dto.maxDevices ?? 1 });
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@CurrentUser() user: AuthUser) {
    return this.shares.list(user.id);
  }

  // Rotas fixas antes das com :id
  @Get('notices')
  @Header('Cache-Control', 'no-store')
  notices(@CurrentUser() user: AuthUser) {
    return this.shares.notices(user.id);
  }

  @Post('notices/seen')
  @HttpCode(204)
  seen(@CurrentUser() user: AuthUser) {
    return this.shares.markNoticesSeen(user.id);
  }

  @Delete(':id')
  @HttpCode(204)
  revoke(@CurrentUser() user: AuthUser, @Param() { id }: ShareIdParamDto) {
    return this.shares.revoke(user.id, id);
  }

  @Post(':id/release')
  @HttpCode(200)
  release(@CurrentUser() user: AuthUser, @Param() { id }: ShareIdParamDto) {
    return this.shares.releaseDevices(user.id, id);
  }
}

/** Rotas públicas (sem sessão). Nada é cacheado; o cookie do aparelho é restrito ao link. */
@Public()
@Controller('public/reports')
export class PublicReportsController {
  constructor(
    private readonly shares: ReportSharesService,
    private readonly config: ConfigService,
  ) {}

  /** Sem cookie de aparelho válido devolve só o formulário (`state: 'code'`) e NUNCA consome vaga. */
  @Get(':token')
  @Header('Cache-Control', 'no-store')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  view(@Param() { token }: ShareTokenParamDto, @Req() req: Request) {
    return this.shares.view(token, req.cookies?.[DEVICE_COOKIE]);
  }

  /**
   * PDF do relatório do link: as mesmas exigências da tela (código + cookie de aparelho VÁLIDO) e nunca consome vaga.
   * Sem cookie válido, a resposta é sempre a mesma recusa.
   */
  @Get(':token/pdf')
  @Header('Cache-Control', 'no-store')
  @Header('Content-Type', 'application/pdf')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async pdf(@Param() { token }: ShareTokenParamDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const view = await this.shares.view(token, req.cookies?.[DEVICE_COOKIE]);
    if (view.state !== 'report') throw new ForbiddenException(MSG.generic);
    res.setHeader('Content-Disposition', `attachment; filename="${pdfFilename(view.report.from, view.report.to)}"`);
    return new StreamableFile(await renderNutritionistPdf(view.report));
  }

  @Post(':token/unlock')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async unlock(@Param() { token }: ShareTokenParamDto, @Body() dto: UnlockShareDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const r = await this.shares.unlock(token, dto.code, req.ip ?? 'desconhecido', req.cookies?.[DEVICE_COOKIE]);
    const secure = this.config.get<string>('COOKIE_SECURE') !== 'false';
    // O cookie vale só até o link expirar e só nos dois caminhos deste link (um cookie tem um Path: são dois)
    for (const path of cookiePaths(token)) {
      res.cookie(DEVICE_COOKIE, r.deviceToken, { httpOnly: true, secure, sameSite: 'strict', path, expires: r.expiresAt });
    }
    return { ok: true };
  }
}
