import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateWorkoutDto, RepeatWorkoutDto, RestoreWorkoutDto, UpdateWorkoutDto, WeekQueryDto, WorkoutRangeQueryDto } from './dto/workout.dto';
import { WorkoutsService } from './workouts.service';

/** Registro rápido de treino: contexto do dia. As rotas fixas (last, restore) vêm antes das com :id. */
@Controller('workouts')
export class WorkoutsController {
  constructor(private readonly workouts: WorkoutsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() { from, to }: WorkoutRangeQueryDto) {
    return this.workouts.list(user.id, from, to);
  }

  @Get('week')
  week(@CurrentUser() user: AuthUser, @Query() { today }: WeekQueryDto) {
    return this.workouts.week(user.id, today);
  }

  @Get('last')
  last(@CurrentUser() user: AuthUser) {
    return this.workouts.last(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateWorkoutDto) {
    return this.workouts.create(user.id, dto);
  }

  @Post('restore')
  @HttpCode(200)
  restore(@CurrentUser() user: AuthUser, @Body() dto: RestoreWorkoutDto) {
    return this.workouts.restore(user.id, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateWorkoutDto) {
    return this.workouts.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.workouts.remove(user.id, id);
  }

  @Post(':id/repeat')
  repeat(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() { date }: RepeatWorkoutDto) {
    return this.workouts.repeat(user.id, id, date);
  }
}
