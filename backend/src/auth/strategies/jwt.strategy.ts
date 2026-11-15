import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { AUTH_COOKIE, AuthUser, JwtPayload } from '../auth.types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      // Cookie httpOnly para o web; Bearer fica disponível para um futuro app nativo
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => req?.cookies?.[AUTH_COOKIE] ?? null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  /**
   * O JWT não tem estado: um token de conta excluída continuaria válido até expirar. Por isso confere (consulta leve,
   * só o id) se o usuário ainda existe; se não, 401, e qualquer aba aberta volta para o login.
   */
  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true } });
    if (!user) throw new UnauthorizedException('Sua sessão expirou. Entre novamente.');
    return { id: payload.sub, email: payload.email };
  }
}
