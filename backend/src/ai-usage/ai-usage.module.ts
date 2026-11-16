import { Global, Module } from '@nestjs/common';
import { AiQuotaService } from './ai-quota.service';
import { AiUsageConfig } from './ai-usage.config';
import { AiUsageController } from './ai-usage.controller';

@Global()
@Module({
  controllers: [AiUsageController],
  providers: [AiUsageConfig, AiQuotaService],
  exports: [AiUsageConfig, AiQuotaService],
})
export class AiUsageModule {}
