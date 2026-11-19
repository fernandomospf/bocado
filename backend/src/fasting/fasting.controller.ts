import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseFilters, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PrivateRouteExceptionFilter } from '../common/private-routes';
import { FastingGuard } from '../glp1/glp1.access';
import { EndFastDto, FastRangeDto, IdParamDto, StartFastDto, UpdateFastDto } from './dto/fasting.dto';
import { FastingService } from './fasting.service';

/**
 * Jejum intermitente (dado de saúde privado). Exige a preferência ligada e idade mínima (403 neutro), só toca dados da
 * sessão, responde sem cache e nunca registra corpo, query string nem detalhes de erro em log.
 */
@UseGuards(FastingGuard)
@UseFilters(PrivateRouteExceptionFilter)
@Controller('fasting')
export class FastingController {
  constructor(private readonly fasting: FastingService) {}

  // Rotas fixas antes das com :id
  @Get('current')
  current(@CurrentUser() user: AuthUser) {
    return this.fasting.current(user.id);
  }

  @Get()
  range(@CurrentUser() user: AuthUser, @Query() q: FastRangeDto) {
    return this.fasting.range(user.id, q.from, q.to);
  }

  @Post('start')
  start(@CurrentUser() user: AuthUser, @Body() dto: StartFastDto) {
    return this.fasting.start(user.id, dto);
  }

  @Post(':id/end')
  @HttpCode(200)
  end(@CurrentUser() user: AuthUser, @Param() { id }: IdParamDto, @Body() dto: EndFastDto) {
    return this.fasting.end(user.id, id, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param() { id }: IdParamDto, @Body() dto: UpdateFastDto) {
    return this.fasting.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param() { id }: IdParamDto) {
    return this.fasting.remove(user.id, id);
  }
}
