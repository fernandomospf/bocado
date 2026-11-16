import { Global, Module } from '@nestjs/common';
import { BetaConfig } from './beta.config';
import { BetaService } from './beta.service';
import { WaitlistController } from './waitlist.controller';
import { WaitlistService } from './waitlist.service';

@Global()
@Module({
  controllers: [WaitlistController],
  providers: [BetaConfig, BetaService, WaitlistService],
  exports: [BetaConfig, BetaService],
})
export class BetaModule {}
