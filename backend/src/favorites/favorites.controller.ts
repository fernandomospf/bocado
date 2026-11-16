import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateFavoriteDto, LogFavoriteDto, RenameFavoriteDto } from './dto/favorite.dto';
import { FavoritesService } from './favorites.service';

@Controller('favorites')
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.favorites.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateFavoriteDto) {
    return this.favorites.create(user.id, dto);
  }

  @Patch(':id')
  rename(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RenameFavoriteDto) {
    return this.favorites.rename(user.id, id, dto.name);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.favorites.remove(user.id, id);
  }

  /** Registra a favorita como refeição nova na data e no tipo informados. */
  @Post(':id/log')
  @HttpCode(201)
  log(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LogFavoriteDto) {
    return this.favorites.log(user.id, id, dto);
  }
}
