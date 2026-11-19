import { Body, Controller, Get, Param, Put, Query, UseFilters, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PrivateRouteExceptionFilter } from '../common/private-routes';
import { DateParamDto, PutWellbeingDto, RangeQueryDto, TodayQueryDto } from './dto/glp1.dto';
import { Glp1Guard, WellbeingGuard } from './glp1.access';
import { Glp1Service } from './glp1.service';
import { WellbeingService } from './wellbeing.service';

/**
 * Bem-estar (dado de saúde privado). Exige uma das duas preferências ligadas (WellbeingGuard) e idade mínima (403 neutro); só toca dados da
 * sessão; sem cache (no-store) e sem corpo, query ou detalhes de erro em log.
 */
@UseGuards(WellbeingGuard)
@UseFilters(PrivateRouteExceptionFilter)
@Controller('wellbeing')
export class WellbeingController {
  constructor(private readonly wellbeing: WellbeingService) {}

  // A rota sem parâmetro (período) é a mesma "raiz": GET /wellbeing?from=&to=
  @Get()
  range(@CurrentUser() user: AuthUser, @Query() q: RangeQueryDto) {
    return this.wellbeing.range(user.id, q.from, q.to);
  }

  @Get(':date')
  get(@CurrentUser() user: AuthUser, @Param() { date }: DateParamDto) {
    return this.wellbeing.get(user.id, date);
  }

  @Put(':date')
  put(@CurrentUser() user: AuthUser, @Param() { date }: DateParamDto, @Body() dto: PutWellbeingDto) {
    return this.wellbeing.put(user.id, date, dto);
  }
}

@UseGuards(Glp1Guard)
@UseFilters(PrivateRouteExceptionFilter)
@Controller('glp1')
export class Glp1Controller {
  constructor(private readonly glp1: Glp1Service) {}

  @Get('summary')
  summary(@CurrentUser() user: AuthUser, @Query() { today }: TodayQueryDto) {
    return this.glp1.summary(user.id, today);
  }
}
