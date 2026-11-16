import { Module } from '@nestjs/common';
import { HouseholdController, InvitesController } from './household.controller';
import { HouseholdService } from './household.service';

@Module({
  controllers: [HouseholdController, InvitesController],
  providers: [HouseholdService],
  exports: [HouseholdService],
})
export class HouseholdModule {}
