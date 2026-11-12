import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-google-oauth20';
import { AuthService } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    config: ConfigService,
    private readonly auth: AuthService,
  ) {
    super({
      clientID: config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      clientSecret: config.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL: `${config.getOrThrow<string>('APP_URL')}/api/auth/google/callback`,
      scope: ['email', 'profile'],
    });
  }

  async validate(_accessToken: string, _refreshToken: string, profile: Profile) {
    const primary = profile.emails?.[0];
    if (!primary?.value) throw new UnauthorizedException('Conta Google sem e-mail');

    return this.auth.findOrCreateGoogleUser({
      googleId: profile.id,
      email: primary.value,
      emailVerified: profile._json?.email_verified === true,
      name: profile.displayName || primary.value.split('@')[0],
      avatarUrl: profile.photos?.[0]?.value,
    });
  }
}
