import { Module } from '@nestjs/common';
import { FastingGuard, WellbeingGuard } from '../glp1/glp1.access';
import { PrivateRouteExceptionFilter } from '../common/private-routes';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';

@Module({ controllers: [ExportController], providers: [ExportService, FastingGuard, WellbeingGuard, PrivateRouteExceptionFilter] })
export class ExportModule {}
