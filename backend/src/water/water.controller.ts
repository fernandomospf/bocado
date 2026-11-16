import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AddWaterDto, WaterDateQueryDto, WaterRangeQueryDto, WaterStreakQueryDto } from './dto/water.dto';
import { WaterService } from './water.service';

@Throttle({ default: { limit: 60, ttl: 60_000 } })
@Controller('water')
export class WaterController {
  constructor(private readonly water: WaterService) {}

  /** O dia: meta que valia, total, registros e como a meta foi calculada. */
  @Get()
  get(@CurrentUser() user: AuthUser, @Query() { date }: WaterDateQueryDto) {
    return this.water.get(user.id, date);
  }

  @Get('range')
  range(@CurrentUser() user: AuthUser, @Query() { from, to }: WaterRangeQueryDto) {
    return this.water.range(user.id, from, to);
  }

  @Get('streak')
  streak(@CurrentUser() user: AuthUser, @Query() { today }: WaterStreakQueryDto) {
    return this.water.streak(user.id, today);
  }

  @Post()
  @HttpCode(201)
  add(@CurrentUser() user: AuthUser, @Body() dto: AddWaterDto) {
    return this.water.add(user.id, dto.date, dto.amountMl);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.water.remove(user.id, id);
  }
}
