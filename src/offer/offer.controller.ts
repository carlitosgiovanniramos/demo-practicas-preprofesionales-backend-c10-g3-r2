import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Req, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'
import { Roles } from '../auth/decorators/roles.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { CreateOfferDto } from './dto/create-offer.dto'
import { OfferService } from './offer.service'

@Controller('offers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OfferController {
  constructor(private readonly service: OfferService) {}

  @Get()
  findAll() {
    return this.service.findAll()
  }

  // Nota de ruta: 'me' va antes que ':id' — si no, ParseIntPipe intenta
  // convertir "me" a número y devuelve 400 (mismo caso que /placements/accreditation).
  @Get('me')
  @Roles(Role.COMPANY)
  findMine(@Req() req: { user: { sub: number } }) {
    return this.service.findAllForCompanyUser(req.user.sub)
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id)
  }

  @Post()
  @Roles(Role.COMPANY, Role.COORDINATOR)
  create(@Body() dto: CreateOfferDto) {
    return this.service.create(dto)
  }

  @Patch(':id/publish')
  @Roles(Role.COMPANY, Role.COORDINATOR)
  publish(@Param('id', ParseIntPipe) id: number) {
    return this.service.publish(id)
  }

  @Patch(':id/close')
  @Roles(Role.COMPANY, Role.COORDINATOR)
  close(@Param('id', ParseIntPipe) id: number) {
    return this.service.close(id)
  }
}
