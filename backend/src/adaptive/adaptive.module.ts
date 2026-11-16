import { Module } from '@nestjs/common';
import { ProfileModule } from '../profile/profile.module';
import { AdaptiveController } from './adaptive.controller';
import { AdaptiveService } from './adaptive.service';

@Module({ imports: [ProfileModule], controllers: [AdaptiveController], providers: [AdaptiveService] })
export class AdaptiveModule {}
