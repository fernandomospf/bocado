import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import bcrypt from 'bcryptjs';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AUTH_COOKIE, JwtPayload, SESSION_TTL_DAYS } from './auth.types';
import { LoginDto, RegisterDto } from './dto/auth.dto';

// Hash fixo usado quando o e-mail não existe, para o tempo de resposta não revelar contas
const DUMMY_HASH = bcrypt.hashSync('bocado-timing-safe-placeholder', 12);

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  get googleEnabled() {
    return Boolean(this.config.get('GOOGLE_CLIENT_ID') && this.config.get('GOOGLE_CLIENT_SECRET'));
  }

  async register(dto: RegisterDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Já existe uma conta com este e-mail');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    return this.prisma.user.create({
      data: { email: dto.email, name: dto.name, passwordHash },
    });
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const valid = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !user.passwordHash || !valid) {
      throw new UnauthorizedException('E-mail ou senha incorretos');
    }
    return user;
  }

  async findOrCreateGoogleUser(input: {
    googleId: string;
    email: string;
    emailVerified: boolean;
    name: string;
    avatarUrl?: string;
  }) {
    const email = input.email.trim().toLowerCase();

    const byGoogle = await this.prisma.user.findUnique({ where: { googleId: input.googleId } });
    if (byGoogle) return byGoogle;

    const byEmail = await this.prisma.user.findUnique({ where: { email } });
    if (byEmail) {
      // Só vincula a uma conta existente se o Google confirmar a posse do e-mail
      if (!input.emailVerified) throw new UnauthorizedException('E-mail do Google não verificado');
      return this.prisma.user.update({
        where: { id: byEmail.id },
        data: { googleId: input.googleId, avatarUrl: byEmail.avatarUrl ?? input.avatarUrl },
      });
    }

    return this.prisma.user.create({
      data: { email, name: input.name, googleId: input.googleId, avatarUrl: input.avatarUrl },
    });
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: { select: { userId: true } } },
    });
    if (!user) throw new UnauthorizedException();
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      hasPassword: Boolean(user.passwordHash),
      onboarded: Boolean(user.profile),
    };
  }

  startSession(res: Response, user: Pick<User, 'id' | 'email'>) {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    const token = this.jwt.sign(payload);
    res.cookie(AUTH_COOKIE, token, {
      httpOnly: true,
      secure: this.config.get('COOKIE_SECURE') !== 'false',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    });
  }

  endSession(res: Response) {
    res.clearCookie(AUTH_COOKIE, { path: '/' });
  }
}
