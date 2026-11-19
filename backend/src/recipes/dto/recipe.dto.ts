import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class RecipeIngredientDto {
  /** Alimento de origem (TACO ou próprio), se veio da busca. */
  @IsOptional()
  @IsUUID()
  foodId?: string;

  @IsString()
  @MinLength(1, { message: 'Dê um nome ao ingrediente' })
  @MaxLength(120)
  @Transform(trim)
  name: string;

  @IsNumber({ maxDecimalPlaces: 1 }) @Min(0.1, { message: 'Informe os gramas de cada ingrediente' }) @Max(20000)
  grams: number;

  @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Max(100000)
  kcal: number;

  @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Max(10000)
  protein: number;

  @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Max(10000)
  carbs: number;

  @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Max(10000)
  fat: number;
}

export class SaveRecipeDto {
  @IsString()
  @MinLength(2, { message: 'Dê um nome à receita' })
  @MaxLength(120)
  @Transform(trim)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Transform(trim)
  notes?: string;

  /** Peso final da panela, em gramas. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 }) @Min(1) @Max(100000)
  totalCookedGrams?: number | null;

  @IsOptional()
  @IsInt({ message: 'Porções deve ser um número inteiro' }) @Min(1) @Max(200)
  servings?: number | null;

  @IsArray()
  @ArrayMinSize(1, { message: 'Adicione pelo menos um ingrediente' })
  @ArrayMaxSize(80)
  @ValidateNested({ each: true })
  @Type(() => RecipeIngredientDto)
  ingredients: RecipeIngredientDto[];
}

export class ShareRecipeDto {
  @IsBoolean()
  shared: boolean;
}

export class ShoppingItemDto {
  @IsUUID()
  recipeId: string;

  /** Quantas vezes a receita vai ser preparada (1 a 10). */
  @IsInt({ message: 'Informe quantas vezes vai preparar' })
  @Min(1, { message: 'Prepare pelo menos 1 vez' })
  @Max(10, { message: 'No máximo 10 vezes por receita' })
  times: number;
}

export class ShoppingListDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Escolha ao menos uma receita' })
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ShoppingItemDto)
  items: ShoppingItemDto[];
}
