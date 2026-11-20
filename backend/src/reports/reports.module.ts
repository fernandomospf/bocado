import { Module } from '@nestjs/common';
import { NutritionistReportController, ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { PublicReportsController, ReportSharesController } from './shares.controller';
import { ReportSharesService } from './shares.service';

@Module({ controllers: [ReportsController, NutritionistReportController, ReportSharesController, PublicReportsController], providers: [ReportsService, ReportSharesService] })
export class ReportsModule {}
