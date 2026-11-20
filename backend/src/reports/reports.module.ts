import { Module } from '@nestjs/common';
import { NutritionistReportController, ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({ controllers: [ReportsController, NutritionistReportController], providers: [ReportsService] })
export class ReportsModule {}
