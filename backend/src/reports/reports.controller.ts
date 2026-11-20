import { Controller, Get, Header, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { NutritionistQueryDto, WeeklyListQueryDto, WeeklyPendingQueryDto, WeeklyQueryDto } from './dto/reports.dto';
import { pdfFilename, renderNutritionistPdf } from './nutritionist.pdf';
import { ReportsService } from './reports.service';

/** Relatórios calculados sob demanda a partir de refeições e peso. Sem IA e sem tabela própria. */
@Controller('reports/weekly')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  weekly(@CurrentUser() user: AuthUser, @Query() { week }: WeeklyQueryDto) {
    return this.reports.weekly(user.id, week);
  }

  @Get('list')
  list(@CurrentUser() user: AuthUser, @Query() { limit }: WeeklyListQueryDto) {
    return this.reports.list(user.id, limit);
  }

  @Get('pending')
  pending(@CurrentUser() user: AuthUser, @Query() { today, hour }: WeeklyPendingQueryDto) {
    return this.reports.pending(user.id, today, hour);
  }
}

/** Relatório imprimível para o nutricionista: só os dados da sessão, calculados na hora e sem cache. */
@Controller('reports/nutritionist')
export class NutritionistReportController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  report(@CurrentUser() user: AuthUser, @Query() { from, to, foods, name }: NutritionistQueryDto) {
    return this.reports.nutritionist(user.id, from, to, { foods, includeName: name });
  }
}

/** O mesmo relatório em PDF (A4), gerado no servidor: funciona também no app instalado do iPhone. Mesmas opções e regras da tela. */
@Controller('reports')
export class NutritionistPdfController {
  constructor(private readonly reports: ReportsService) {}

  @Get('nutritionist.pdf')
  @Header('Cache-Control', 'no-store')
  @Header('Content-Type', 'application/pdf')
  async pdf(@CurrentUser() user: AuthUser, @Query() { from, to, foods, name }: NutritionistQueryDto, @Res({ passthrough: true }) res: Response) {
    const data = await this.reports.nutritionist(user.id, from, to, { foods, includeName: name });
    res.setHeader('Content-Disposition', `attachment; filename="${pdfFilename(from, to)}"`);
    return new StreamableFile(await renderNutritionistPdf(data));
  }
}
