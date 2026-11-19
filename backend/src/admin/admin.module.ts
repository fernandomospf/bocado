import { Module } from '@nestjs/common';
import { AdminFoodsService } from './admin-foods.service';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { AiUsageAdminService } from './ai-usage-admin.service';

@Module({
  controllers: [AdminController],
  providers: [AdminService, AiUsageAdminService, AdminFoodsService, AdminGuard],
})
export class AdminModule {}
