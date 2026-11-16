import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { User } from '@prisma/client';
import type { Request, Response } from 'express';
import { isBetaAccessError } from '../beta/beta.errors';
import { type AuthUser, BETA_INVITE_COOKIE } from './auth.types';
import { AuthService, type GoogleAccountInput } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { GoogleAuthGuard, GoogleCallbackGuard } from './guards/google-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get('providers')
  async providers() {
    return { google: this.auth.googleEnabled, ...(await this.auth.registrationInfo()) };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.register(dto);
    this.auth.startSession(res, user);
    return this.auth.getMe(user.id);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.login(dto);
    this.auth.startSession(res, user);
    return this.auth.getMe(user.id);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response) {
    this.auth.endSession(res);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.getMe(user.id);
  }

  @Public()
  @UseGuards(GoogleAuthGuard)
  @Get('google')
  google() {
    // O guard redireciona para o Google
  }

  @Public()
  @UseGuards(GoogleCallbackGuard)
  @Get('google/callback')
  async googleCallback(@Req() req: Request & { user: { user: User } | { newAccount: GoogleAccountInput } }, @Res() res: Response) {
    const app = this.config.getOrThrow<string>('APP_URL');
    let user: User;
    if ('user' in req.user) {
      user = req.user.user; // conta existente: login normal, sem convite
    } else {
      try {
        user = await this.auth.createGoogleUser(req.user.newAccount, this.auth.readInviteCookie(req.cookies?.[BETA_INVITE_COOKIE]));
      } catch (err) {
        if (isBetaAccessError(err)) return res.redirect(`${app}/login?error=${err.reason}`);
        throw err;
      }
    }
    this.auth.startSession(res, user);
    res.redirect(`${app}/`);
  }
}
