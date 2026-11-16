import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { JoinWaitlistDto } from './waitlist.dto';
import { WaitlistService } from './waitlist.service';

/** Lista de espera pública. Só existe o POST: nenhuma listagem fora do /admin. */
@Controller('waitlist')
export class WaitlistController {
  constructor(private readonly waitlist: WaitlistService) {}

  @Public()
  @Post()
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  join(@Body() dto: JoinWaitlistDto) {
    return this.waitlist.join(dto);
  }
}
