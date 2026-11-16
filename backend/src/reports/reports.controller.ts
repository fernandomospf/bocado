import { Controller, Get, Query } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { WeeklyListQueryDto, WeeklyPendingQueryDto, WeeklyQueryDto } from './dto/reports.dto';
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
