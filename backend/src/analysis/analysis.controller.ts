import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { AnalysisService } from './analysis.service';
import { AnalyzePhotoDto, AnalyzeTextDto } from './dto/analysis.dto';

// Sem 'dest', o Multer mantém o arquivo só em memória (não grava em disco)
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

// Chamadas à IA têm custo: limite próprio por usuário
@Throttle({ default: { limit: 12, ttl: 60_000 } })
@Controller('analysis')
export class AnalysisController {
  constructor(private readonly analysis: AnalysisService) {}

  @Post('photo')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
    }),
  )
  photo(@UploadedFile() file: Express.Multer.File | undefined, @Body() dto: AnalyzePhotoDto) {
    if (!file) throw new BadRequestException('Envie uma foto da refeição');
    return this.analysis.analyzePhoto(file.buffer, file.mimetype, dto.hint);
  }

  @Post('text')
  @HttpCode(200)
  text(@Body() dto: AnalyzeTextDto) {
    return this.analysis.analyzeText(dto.description);
  }
}
