import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { SupplementsController } from './supplements.controller';
import { SupplementsGuard } from './supplements.guard';
import { NoStoreMiddleware, SupplementsExceptionFilter } from './supplements.http';
import { SupplementsService } from './supplements.service';

@Module({
  controllers: [SupplementsController],
  providers: [SupplementsService, SupplementsGuard, SupplementsExceptionFilter],
  exports: [SupplementsGuard],
})
export class SupplementsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(NoStoreMiddleware).forRoutes(SupplementsController);
  }
}
