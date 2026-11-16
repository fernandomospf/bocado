import { Module } from '@nestjs/common';
import { AnalysisCacheService } from './analysis.cache';
import { AnalysisController } from './analysis.controller';
import { AnalysisService } from './analysis.service';
import { PreparationFatService } from './preparation-fat';

@Module({
  controllers: [AnalysisController],
  providers: [AnalysisService, AnalysisCacheService, PreparationFatService],
  exports: [AnalysisService],
})
export class AnalysisModule {}
