import { Controller, Get, Query, StreamableFile } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Readable } from 'node:stream';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ExportQueryDto } from './dto';
import { ExportService } from './export.service';
import { resolvePeriod } from './period';

/** Arquivo transmitido em streaming, com nome e tipo para download. */
function csvFile(chunks: AsyncGenerator<string>, kind: 'refeicoes' | 'peso', from: string, to: string) {
  return new StreamableFile(Readable.from(chunks), {
    type: 'text/csv; charset=utf-8',
    disposition: `attachment; filename="bocado-${kind}-${from}_a_${to}.csv"`,
  });
}

// Exportar lê muito do banco: limite próprio por usuário
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller('export')
export class ExportController {
  constructor(private readonly exports: ExportService) {}

  /** Contagem de registros no período (o app avisa e não baixa um arquivo vazio). */
  @Get('summary')
  summary(@CurrentUser() user: AuthUser, @Query() q: ExportQueryDto) {
    const { from, to } = resolvePeriod(q.period, q.to);
    return this.exports.summary(user.id, from, to);
  }

  @Get('meals.csv')
  meals(@CurrentUser() user: AuthUser, @Query() q: ExportQueryDto) {
    const { from, to } = resolvePeriod(q.period, q.to);
    return csvFile(this.exports.mealsCsv(user.id, from, to), 'refeicoes', from, to);
  }

  @Get('weight.csv')
  weight(@CurrentUser() user: AuthUser, @Query() q: ExportQueryDto) {
    const { from, to } = resolvePeriod(q.period, q.to);
    return csvFile(this.exports.weightCsv(user.id, from, to), 'peso', from, to);
  }
}
