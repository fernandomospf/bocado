import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BodyDataDto, SaveProfileDto, TargetsDto } from './dto/profile.dto';
import { ProfileService } from './profile.service';

@Controller('profile')
export class ProfileController {
  constructor(private readonly profiles: ProfileService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.profiles.get(user.id);
  }

  /** Calcula a sugestão sem salvar (última etapa do questionário). */
  @Post('preview')
  @HttpCode(200)
  preview(@Body() dto: BodyDataDto) {
    return this.profiles.preview(dto);
  }

  @Put()
  save(@CurrentUser() user: AuthUser, @Body() dto: SaveProfileDto) {
    return this.profiles.save(user.id, dto);
  }

  @Put('targets')
  updateTargets(@CurrentUser() user: AuthUser, @Body() dto: TargetsDto) {
    return this.profiles.updateTargets(user.id, dto);
  }

  @Post('targets/reset')
  @HttpCode(200)
  resetTargets(@CurrentUser() user: AuthUser) {
    return this.profiles.resetTargets(user.id);
  }
}
