import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AnalysisService } from './analysis.service';
import { normalizeBarcode } from '../foods/barcode';
import { AnalyzeLabelDto, AnalyzePhotoDto, AnalyzeTextDto } from './dto/analysis.dto';
import { PreparationFatService } from './preparation-fat';

// Sem 'dest', o Multer mantém o arquivo só em memória (não grava em disco)
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

// Chamadas à IA têm custo: limite próprio por usuário
@Throttle({ default: { limit: 12, ttl: 60_000 } })
@Controller('analysis')
export class AnalysisController {
  constructor(
    private readonly analysis: AnalysisService,
    private readonly preparationFat: PreparationFatService,
  ) {}

  /** Valores de referência da gordura de preparo (sem IA): o app monta o item com eles, sem duplicar a regra. */
  @Get('preparation-fat')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  preparationFatTable() {
    return this.preparationFat.table();
  }

  @Post('photo')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
    }),
  )
  photo(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File | undefined, @Body() dto: AnalyzePhotoDto) {
    if (!file) throw new BadRequestException('Envie uma foto da refeição');
    return this.analysis.analyzePhoto(file.buffer, file.mimetype, dto.hint, user.id);
  }

  @Post('text')
  @HttpCode(200)
  text(@CurrentUser() user: AuthUser, @Body() dto: AnalyzeTextDto) {
    return this.analysis.analyzeText(dto.description, user.id);
  }

  /**
   * Produto novo: lê a frente (opcional) e a tabela nutricional (obrigatória) com a IA e devolve um rascunho
   * para revisão. Chamado no máximo uma vez por produto: depois de salvo, o produto vem do acervo.
   */
  @Post('label')
  @HttpCode(200)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'front', maxCount: 1 },
        { name: 'table', maxCount: 1 },
      ],
      { limits: { fileSize: MAX_IMAGE_BYTES, files: 2 } },
    ),
  )
  label(
    @CurrentUser() user: AuthUser,
    @UploadedFiles() files: { front?: Express.Multer.File[]; table?: Express.Multer.File[] } | undefined,
    @Body() dto: AnalyzeLabelDto,
  ) {
    const table = files?.table?.[0];
    const front = files?.front?.[0];
    if (!table) throw new BadRequestException('Envie a foto da tabela nutricional');
    let barcode: string | null = null;
    if (dto.barcode) {
      barcode = normalizeBarcode(dto.barcode);
      if (!barcode) throw new BadRequestException('Código de barras inválido');
    }
    const images = [
      ...(front ? [{ buffer: front.buffer, mimeType: front.mimetype, role: 'front' as const }] : []),
      { buffer: table.buffer, mimeType: table.mimetype, role: 'table' as const },
    ];
    return this.analysis.analyzeLabel(images, barcode, user.id);
  }
}
