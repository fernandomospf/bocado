import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { HouseholdNameDto, JoinHouseholdDto, MemberPrefsDto } from './dto/household.dto';
import { HouseholdService } from './household.service';

@Controller('household')
export class HouseholdController {
  constructor(private readonly household: HouseholdService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.household.get(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: HouseholdNameDto) {
    return this.household.create(user.id, dto.name);
  }

  @Patch()
  rename(@CurrentUser() user: AuthUser, @Body() dto: HouseholdNameDto) {
    return this.household.rename(user.id, dto.name);
  }

  @Get('invites')
  listInvites(@CurrentUser() user: AuthUser) {
    return this.household.listInvites(user.id);
  }

  @Post('invites')
  createInvite(@CurrentUser() user: AuthUser) {
    return this.household.createInvite(user.id);
  }

  @Delete('invites/:id')
  @HttpCode(204)
  revokeInvite(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.household.revokeInvite(user.id, id);
  }

  @Post('join')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  join(@CurrentUser() user: AuthUser, @Body() dto: JoinHouseholdDto) {
    return this.household.join(user.id, dto.code);
  }

  @Patch('members/me')
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: MemberPrefsDto) {
    return this.household.updateMyPrefs(user.id, dto.autoAcceptShared);
  }

  @Delete('members/me')
  @HttpCode(204)
  leave(@CurrentUser() user: AuthUser) {
    return this.household.leave(user.id);
  }

  @Delete('members/:userId')
  @HttpCode(204)
  removeMember(@CurrentUser() user: AuthUser, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.household.removeMember(user.id, userId);
  }
}

/** Pré-visualização pública do convite (a pessoa ainda pode nem ter conta). */
@Controller('invites')
export class InvitesController {
  constructor(private readonly household: HouseholdService) {}

  @Public()
  @Get(':code/preview')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  preview(@Param('code') code: string) {
    return this.household.preview(code);
  }
}
