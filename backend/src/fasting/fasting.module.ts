import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { NoStoreMiddleware, PrivateRouteExceptionFilter } from '../common/private-routes';
import { FastingGuard } from '../glp1/glp1.access';
import { FastingController } from './fasting.controller';
import { FastingService } from './fasting.service';

@Module({
  controllers: [FastingController],
  providers: [FastingService, FastingGuard, PrivateRouteExceptionFilter],
})
export class FastingModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(NoStoreMiddleware).forRoutes(FastingController);
  }
}
