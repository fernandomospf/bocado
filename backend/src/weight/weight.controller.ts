import { Body, Controller, Delete, Get, HttpCode, Param, Put, Query } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SaveWeightDto, WeightDateParamDto, WeightRangeQueryDto } from './dto/weight.dto';
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
