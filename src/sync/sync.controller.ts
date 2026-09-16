import { Body, Controller, DefaultValuePipe, Get, ParseIntPipe, Post, Query, Req, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { PushDto } from './dto/push.dto'
import { SyncService } from './sync.service'

@Controller('sync')
@UseGuards(JwtAuthGuard)
export class SyncController {
  constructor(private readonly service: SyncService) {}

  @Get('pull')
  pull(
    @Req() req: { user: { sub: number } },
    @Query('since') since?: string,
    @Query('limit', new DefaultValuePipe(200), ParseIntPipe) limit = 200,
  ) {
    return this.service.pull(req.user.sub, since, Math.min(limit, 500))
  }

  @Post('push')
  push(@Req() req: { user: { sub: number } }, @Body() dto: PushDto) {
    return this.service.push(req.user.sub, dto.ops)
  }
}
