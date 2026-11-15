import { Module } from '@nestjs/common';
import { AnalysisController } from './analysis.controller';
import { AnalysisService } from './analysis.service';
import { PreparationFatService } from './preparation-fat';

@Module({
  controllers: [AnalysisController],
  providers: [AnalysisService, PreparationFatService],
  exports: [AnalysisService],
})
export class AnalysisModule {}
