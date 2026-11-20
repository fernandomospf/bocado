import { Module } from '@nestjs/common';
import { NutritionistPdfController, NutritionistReportController, ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { PublicReportsController, ReportSharesController } from './shares.controller';
import { ReportSharesService } from './shares.service';

@Module({ controllers: [ReportsController, NutritionistReportController, NutritionistPdfController, ReportSharesController, PublicReportsController], providers: [ReportsService, ReportSharesService] })
export class ReportsModule {}
