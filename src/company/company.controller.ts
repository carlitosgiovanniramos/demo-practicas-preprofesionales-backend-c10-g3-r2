import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'
import { Roles } from '../auth/decorators/roles.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { CompanyService } from './company.service'
import { CreateCompanyDto } from './dto/create-company.dto'

@Controller('companies')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CompanyController {
  constructor(private readonly service: CompanyService) {}

  @Get()
  findAll() {
    return this.service.findAll()
  }

  @Post()
  @Roles(Role.COORDINATOR)
  create(@Body() dto: CreateCompanyDto) {
    return this.service.create(dto)
  }
}
