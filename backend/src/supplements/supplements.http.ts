import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/**
 * Nenhuma resposta do módulo vai para cache (navegador, proxy ou CDN): são dados de saúde.
 */
@Injectable()
export class NoStoreMiddleware implements NestMiddleware {
  use(_req: Request, res: Response, next: NextFunction) {
    res.setHeader('Cache-Control', 'no-store');
    next();
  }
}

/**
 * Erros desta área nunca vão para o log com detalhes. O tratamento padrão do Nest registra a mensagem e a pilha do erro,
 * e um erro do Prisma carrega os argumentos da consulta (nome do plano, dose, notas). Aqui só ficam o método, a rota
 * (sem a query) e o tipo do erro. Corpo de requisição e de resposta nunca são registrados.
 */
@Catch()
@Injectable()
export class SupplementsExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Supplements');

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    if (exception instanceof HttpException) {
      res.status(exception.getStatus()).json(exception.getResponse());
      return;
    }
    const req = http.getRequest<Request>();
    const kind = exception instanceof Error ? exception.constructor.name : typeof exception;
    const code = (exception as { code?: unknown } | null)?.code;
    this.logger.error(`${req.method} ${req.path} falhou (${kind}${typeof code === 'string' ? ` ${code}` : ''}); detalhes omitidos`);
    res.status(500).json({ statusCode: 500, message: 'Internal server error' });
  }
}
