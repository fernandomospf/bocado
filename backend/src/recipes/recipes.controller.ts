import { Body, Patch, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SaveRecipeDto, ShareRecipeDto, ShoppingListDto } from './dto/recipe.dto';
import { RecipesService } from './recipes.service';

@Controller('recipes')
export class RecipesController {
  constructor(private readonly recipes: RecipesService) {}

  /** Receitas do usuário e as compartilhadas com a casa dele. */
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.recipes.list(user.id);
  }

  /**
   * Lista de compras: ingredientes das receitas escolhidas (vezes de preparo), somados por nome, em gramas arredondadas a
   * 10 g e agrupados pela categoria da TACO. Sem IA; só receitas visíveis à pessoa. (Declarada antes das rotas com :id.)
   */
  @Post('shopping-list')
  @HttpCode(200)
  shoppingList(@CurrentUser() user: AuthUser, @Body() dto: ShoppingListDto) {
    return this.recipes.shoppingList(user.id, dto.items);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.recipes.get(user.id, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: SaveRecipeDto) {
    return this.recipes.create(user.id, dto);
  }

  /** Cópia própria da receita (para editar uma receita da casa). */
  @Post(':id/duplicate')
  duplicate(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.recipes.duplicate(user.id, id);
  }

  /** Compartilha a receita com a casa ou volta a privada (só o dono). */
  @Patch(':id/share')
  share(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ShareRecipeDto) {
    return this.recipes.setShared(user.id, id, dto.shared);
  }

  @Put(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveRecipeDto) {
    return this.recipes.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.recipes.remove(user.id, id);
  }
}
