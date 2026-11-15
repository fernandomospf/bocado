import { Body, Controller, Delete, HttpCode, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AuthService } from '../auth/auth.service';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DeleteAccountDto } from './account.dto';
import { AccountService } from './account.service';

@Controller('account')
export class AccountController {
  constructor(
    private readonly account: AccountService,
    private readonly auth: AuthService,
  ) {}

  /** Exclui a conta e todos os dados; encerra a sessão. */
  @Delete()
  @HttpCode(204)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async remove(
    @CurrentUser() user: AuthUser,
    @Body() dto: DeleteAccountDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.account.deleteAccount(user.id, dto);
    this.auth.endSession(res);
  }
}
