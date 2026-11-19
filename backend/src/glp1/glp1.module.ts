import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { NoStoreMiddleware, PrivateRouteExceptionFilter } from '../common/private-routes';
import { Glp1Guard, WellbeingGuard } from './glp1.access';
import { Glp1Controller, WellbeingController } from './glp1.controller';
import { Glp1Service } from './glp1.service';
import { WellbeingService } from './wellbeing.service';

@Module({
  controllers: [WellbeingController, Glp1Controller],
  providers: [WellbeingService, Glp1Service, WellbeingGuard, Glp1Guard, PrivateRouteExceptionFilter],
})
export class Glp1Module implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(NoStoreMiddleware).forRoutes(WellbeingController, Glp1Controller);
  }
}
