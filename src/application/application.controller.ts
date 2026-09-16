import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Req, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'
import { Roles } from '../auth/decorators/roles.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { ApplicationService } from './application.service'
import { CreateApplicationDto } from './dto/create-application.dto'
import { DecideApplicationDto } from './dto/decide-application.dto'

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ApplicationController {
  constructor(private readonly service: ApplicationService) {}

  @Post('applications')
  @Roles(Role.STUDENT)
  apply(@Body() dto: CreateApplicationDto, @Req() req: { user: { sub: number } }) {
    return this.service.apply(dto.offerId, req.user.sub, dto.motivation)
  }

  @Get('offers/:offerId/applications')
  @Roles(Role.COMPANY, Role.COORDINATOR)
  listByOffer(@Param('offerId', ParseIntPipe) offerId: number) {
    return this.service.listByOffer(offerId)
  }

  @Get('applications/me')
  @Roles(Role.STUDENT)
  findMine(@Req() req: { user: { sub: number } }) {
    return this.service.listForStudent(req.user.sub)
  }

  @Patch('applications/:id/decide')
  @Roles(Role.COMPANY, Role.COORDINATOR)
  decide(@Param('id', ParseIntPipe) id: number, @Body() dto: DecideApplicationDto) {
    return this.service.decide(id, dto.status)
  }
}
