import { Controller, Get, Header, Query, StreamableFile, UseFilters, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Readable } from 'node:stream';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SupplementsGuard } from '../supplements/supplements.guard';
import { SupplementsExceptionFilter } from '../supplements/supplements.http';
import { ExportQueryDto } from './dto';
import { ExportService } from './export.service';
import { resolvePeriod } from './period';

/** Arquivo transmitido em streaming, com nome e tipo para download. */
function csvFile(chunks: AsyncGenerator<string>, kind: 'refeicoes' | 'peso' | 'treinos' | 'agua' | 'suplementos', from: string, to: string) {
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

  @Get('water.csv')
  water(@CurrentUser() user: AuthUser, @Query() q: ExportQueryDto) {
    const { from, to } = resolvePeriod(q.period, q.to);
    return csvFile(this.exports.waterCsv(user.id, from, to), 'agua', from, to);
  }

  @Get('workouts.csv')
  workouts(@CurrentUser() user: AuthUser, @Query() q: ExportQueryDto) {
    const { from, to } = resolvePeriod(q.period, q.to);
    return csvFile(this.exports.workoutsCsv(user.id, from, to), 'treinos', from, to);
  }

  /**
   * Suplementos e medicações (dado sensível): rotas à parte, só com o módulo ativado, nunca no `summary` padrão e
   * sem cache. A opção é desligada por padrão no app e nunca marcada sozinha.
   */
  @UseGuards(SupplementsGuard)
  @UseFilters(SupplementsExceptionFilter)
  @Header('Cache-Control', 'no-store')
  @Get('supplements/summary')
  supplementsSummary(@CurrentUser() user: AuthUser, @Query() q: ExportQueryDto) {
    const { from, to } = resolvePeriod(q.period, q.to);
    return this.exports.supplementsSummary(user.id, from, to);
  }

  @UseGuards(SupplementsGuard)
  @UseFilters(SupplementsExceptionFilter)
  @Header('Cache-Control', 'no-store')
  @Get('supplements.csv')
  supplements(@CurrentUser() user: AuthUser, @Query() q: ExportQueryDto) {
    const { from, to } = resolvePeriod(q.period, q.to);
    return csvFile(this.exports.supplementsCsv(user.id, from, to), 'suplementos', from, to);
  }
}
