import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, User } from '@prisma/client';
import bcrypt from 'bcryptjs';
import type { Response } from 'express';
import { BetaService, normalizeBetaCode } from '../beta/beta.service';
import { PrismaService } from '../prisma/prisma.service';
import { AUTH_COOKIE, BETA_INVITE_COOKIE, JwtPayload, SESSION_TTL_DAYS } from './auth.types';
import { LoginDto, RegisterDto } from './dto/auth.dto';

export interface GoogleAccountInput {
  googleId: string;
  email: string;
  emailVerified: boolean;
  name: string;
  avatarUrl?: string;
}

// Hash fixo usado quando o e-mail não existe, para o tempo de resposta não revelar contas
const DUMMY_HASH = bcrypt.hashSync('bocado-timing-safe-placeholder', 12);

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly beta: BetaService,
  ) {}

  get googleEnabled() {
    return Boolean(this.config.get('GOOGLE_CLIENT_ID') && this.config.get('GOOGLE_CLIENT_SECRET'));
  }

  async register(dto: RegisterDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Já existe uma conta com este e-mail');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    try {
      // Vagas e convite do beta: tudo na mesma transação da criação do usuário
      return await this.beta.admitNewUser(
        (tx) => tx.user.create({ data: { email: dto.email, name: dto.name, passwordHash } }),
        dto.inviteCode,
      );
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Já existe uma conta com este e-mail');
      }
      throw err;
    }
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const valid = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !user.passwordHash || !valid) {
      throw new UnauthorizedException('E-mail ou senha incorretos');
    }
    return user;
  }

  /**
   * Login com Google: conta existente (por googleId ou por e-mail verificado) entra normalmente; conta NOVA não é criada
   * aqui. Quem decide (convite e vagas do beta) é createGoogleUser, chamado pelo callback.
   */
  async resolveGoogleLogin(input: GoogleAccountInput): Promise<{ user: User } | { newAccount: GoogleAccountInput }> {
    const email = input.email.trim().toLowerCase();

    const byGoogle = await this.prisma.user.findUnique({ where: { googleId: input.googleId } });
    if (byGoogle) return { user: byGoogle };

    const byEmail = await this.prisma.user.findUnique({ where: { email } });
    if (byEmail) {
      // Só vincula a uma conta existente se o Google confirmar a posse do e-mail
      if (!input.emailVerified) throw new UnauthorizedException('E-mail do Google não verificado');
      const user = await this.prisma.user.update({
        where: { id: byEmail.id },
        data: { googleId: input.googleId, avatarUrl: byEmail.avatarUrl ?? input.avatarUrl },
      });
      return { user };
    }

    return { newAccount: { ...input, email } };
  }

  /** Conta Google nova: respeita o limite de vagas e, em modo "invite", exige o convite guardado no cookie. */
  async createGoogleUser(input: GoogleAccountInput, inviteCode: string | null): Promise<User> {
    return this.beta.admitNewUser(
      (tx) =>
        tx.user.create({
          data: { email: input.email.trim().toLowerCase(), name: input.name, googleId: input.googleId, avatarUrl: input.avatarUrl },
        }),
      inviteCode,
    );
  }

  /** Convite do beta guardado num cookie assinado (JWT de 10 min), para sobreviver ao redirect externo do Google. */
  signInviteCookie(code: string) {
    return this.jwt.sign({ purpose: 'beta-invite', code }, { expiresIn: '10m' });
  }

  readInviteCookie(raw: unknown): string | null {
    if (typeof raw !== 'string' || !raw) return null;
    try {
      const payload = this.jwt.verify<{ purpose?: string; code?: string }>(raw);
      return payload.purpose === 'beta-invite' ? normalizeBetaCode(payload.code) || null : null;
    } catch {
      return null;
    }
  }

  async registrationInfo() {
    return { registration: this.beta.config.mode, seatsOpen: await this.beta.seatsOpen() };
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
