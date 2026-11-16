import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { AiUsageAdminService } from './ai-usage-admin.service';

@Module({
  controllers: [AdminController],
  providers: [AdminService, AiUsageAdminService, AdminGuard],
})
export class AdminModule {}
