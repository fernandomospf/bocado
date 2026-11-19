import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ImportIdParamDto, ImportWeightDto, SaveWeightDto, SetWeightGoalDto, WeightDateParamDto, WeightRangeQueryDto } from './dto/weight.dto';
import { WeightService } from './weight.service';

@Controller('weight')
export class WeightController {
  constructor(private readonly weight: WeightService) {}

  /** Registros do período com a média móvel de 7 dias. */
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() { from, to }: WeightRangeQueryDto) {
    return this.weight.list(user.id, from, to);
  }

  /** Último peso, tendência, variações e se as metas ficaram desatualizadas. */
  @Get('summary')
  summary(@CurrentUser() user: AuthUser) {
    return this.weight.summary(user.id);
  }

  /** Define (ou, com null, remove) a meta de peso. Não altera o objetivo do perfil nem as metas de calorias. */
  @Put('goal')
  setGoal(@CurrentUser() user: AuthUser, @Body() dto: SetWeightGoalDto) {
    return this.weight.setGoal(user.id, dto.goalWeightKg);
  }

  /** Importa um lote de pesos já lidos no aparelho (até 5.000). Limite próprio de 10 por minuto. */
  @Post('import')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  importBatch(@CurrentUser() user: AuthUser, @Body() dto: ImportWeightDto) {
    return this.weight.importBatch(user.id, dto);
  }

  @Get('imports')
  imports(@CurrentUser() user: AuthUser) {
    return this.weight.listImports(user.id);
  }

  /** Desfaz a importação: apaga só os registros que ela criou. */
  @Delete('import/:id')
  undoImport(@CurrentUser() user: AuthUser, @Param() { id }: ImportIdParamDto) {
    return this.weight.undoImport(user.id, id);
  }

  @Put(':date')
  save(@CurrentUser() user: AuthUser, @Param() { date }: WeightDateParamDto, @Body() dto: SaveWeightDto) {
    return this.weight.save(user.id, date, dto);
  }

  @Delete(':date')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param() { date }: WeightDateParamDto) {
    return this.weight.remove(user.id, date);
  }
}
