import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  CalendarQueryDto,
  CreatePlanDto,
  DayQueryDto,
  HistoryQueryDto,
  IdParamDto,
  LogDto,
  PlansQueryDto,
  RangeQueryDto,
  SkipDto,
  UpdateLogDto,
  UpdatePlanDto,
} from './dto/supplements.dto';
import { SupplementsGuard } from './supplements.guard';
import { SupplementsExceptionFilter } from './supplements.http';
import { SupplementsService } from './supplements.service';

/**
 * Suplementos e medicações (dado sensível). Todas as rotas exigem o módulo ativado e idade mínima (SupplementsGuard),
 * só tocam dados da sessão, respondem com Cache-Control: no-store (NoStoreMiddleware) e nunca registram corpo,
 * consulta ou detalhes de erro em log (SupplementsExceptionFilter).
 */
@UseGuards(SupplementsGuard)
@UseFilters(SupplementsExceptionFilter)
@Controller('supplements')
export class SupplementsController {
  constructor(private readonly supplements: SupplementsService) {}

  @Get('plans')
  plans(@CurrentUser() user: AuthUser, @Query() q: PlansQueryDto) {
    return this.supplements.listPlans(user.id, q);
  }

  @Post('plans')
  createPlan(@CurrentUser() user: AuthUser, @Body() dto: CreatePlanDto) {
    return this.supplements.createPlan(user.id, dto);
  }

  @Patch('plans/:id')
  updatePlan(@CurrentUser() user: AuthUser, @Param() { id }: IdParamDto, @Body() dto: UpdatePlanDto) {
    return this.supplements.updatePlan(user.id, id, dto);
  }

  /** Apaga o plano e todo o histórico dele (o app confirma antes). */
  @Delete('plans/:id')
  @HttpCode(204)
  deletePlan(@CurrentUser() user: AuthUser, @Param() { id }: IdParamDto) {
    return this.supplements.deletePlan(user.id, id);
  }

  @Post('plans/:id/archive')
  @HttpCode(200)
  archive(@CurrentUser() user: AuthUser, @Param() { id }: IdParamDto) {
    return this.supplements.archive(user.id, id);
  }

  @Post('plans/:id/unarchive')
  @HttpCode(200)
  unarchive(@CurrentUser() user: AuthUser, @Param() { id }: IdParamDto) {
    return this.supplements.unarchive(user.id, id);
  }

  /** Arquivo .ics do plano: só para o dono, sem URL pública, token nem feed de assinatura. */
  @Get('plans/:id/calendar.ics')
  async calendar(@CurrentUser() user: AuthUser, @Param() { id }: IdParamDto, @Query() q: CalendarQueryDto) {
    const ics = await this.supplements.calendar(user.id, id, q);
    return new StreamableFile(Buffer.from(ics, 'utf8'), {
      type: 'text/calendar; charset=utf-8',
      // O nome do arquivo é genérico: nada do plano aparece nele
      disposition: 'attachment; filename="bocado-lembrete.ics"',
    });
  }

  @Get('day')
  day(@CurrentUser() user: AuthUser, @Query() { date }: DayQueryDto) {
    return this.supplements.day(user.id, date);
  }

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('log')
  log(@CurrentUser() user: AuthUser, @Body() dto: LogDto) {
    return this.supplements.log(user.id, dto);
  }

  // A rota fixa "skip" vem antes da com :id
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('log/skip')
  skip(@CurrentUser() user: AuthUser, @Body() dto: SkipDto) {
    return this.supplements.skip(user.id, dto);
  }

  @Patch('log/:id')
  updateLog(@CurrentUser() user: AuthUser, @Param() { id }: IdParamDto, @Body() dto: UpdateLogDto) {
    return this.supplements.updateLog(user.id, id, dto);
  }

  /** Também é o "Desfazer" do toast de registro. */
  @Delete('log/:id')
  @HttpCode(204)
  deleteLog(@CurrentUser() user: AuthUser, @Param() { id }: IdParamDto) {
    return this.supplements.deleteLog(user.id, id);
  }

  @Get('history')
  history(@CurrentUser() user: AuthUser, @Query() q: HistoryQueryDto) {
    return this.supplements.history(user.id, q);
  }

  @Get('weight-markers')
  weightMarkers(@CurrentUser() user: AuthUser, @Query() q: RangeQueryDto) {
    return this.supplements.weightMarkers(user.id, q);
  }
}
