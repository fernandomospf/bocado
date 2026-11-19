import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/**
 * Rotas de dados de saúde privados (bem-estar, jejum): nada vai para cache (navegador, proxy ou CDN) e erros nunca
 * entram no log com detalhes. Mesmo padrão dos suplementos, para qualquer módulo novo do mesmo tipo.
 */
@Injectable()
export class NoStoreMiddleware implements NestMiddleware {
  use(_req: Request, res: Response, next: NextFunction) {
    res.setHeader('Cache-Control', 'no-store');
    next();
  }
}

/**
 * O tratamento padrão do Nest registra a mensagem e a pilha do erro, e um erro do Prisma carrega os argumentos da
 * consulta (datas, notas, escalas). Aqui só ficam o método, a rota (SEM a query string e sem corpo) e o tipo do erro.
 */
@Catch()
@Injectable()
export class PrivateRouteExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('PrivateRoute');

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

/**
 * Rotas de dados de saúde privados. Qualquer integração de monitoramento (GlitchTip/Sentry, APM, access log) deve passar
 * o evento por `scrubPrivateRequest` antes de enviar: sem corpo, sem query string, sem cookies nem cabeçalhos.
 * (Hoje o app só usa o Logger do Nest, que não registra corpo nem query; este é o ponto único para quando houver
 * monitoramento: `beforeSend: (event) => ({ ...event, request: scrubPrivateRequest(event.request) })`.)
 */
export const PRIVATE_ROUTE_PREFIXES = [
  '/api/wellbeing',
  '/api/fasting',
  '/api/glp1',
  '/api/supplements',
  '/api/export/fasting',
  '/api/export/wellbeing',
  '/api/export/supplements',
] as const;

export const isPrivateRoute = (url: string | undefined): boolean => {
  const path = (url ?? '').split('?')[0].split('#')[0];
  return PRIVATE_ROUTE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}.`));
};

interface MonitoredRequest {
  url?: string;
  query_string?: unknown;
  data?: unknown;
  cookies?: unknown;
  headers?: unknown;
  [key: string]: unknown;
}

/** Em rota privada, devolve só método e caminho (sem query string, corpo, cookies e cabeçalhos). */
export function scrubPrivateRequest<T extends MonitoredRequest | undefined>(request: T): T {
  if (!request || !isPrivateRoute(request.url)) return request;
  const { method } = request as { method?: string };
  return { method, url: (request.url ?? '').split('?')[0] } as unknown as T;
}
