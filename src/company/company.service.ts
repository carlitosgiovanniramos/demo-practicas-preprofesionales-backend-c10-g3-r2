import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { CreateCompanyDto } from './dto/create-company.dto'

@Injectable()
export class CompanyService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateCompanyDto) {
    return this.prisma.company.create({ data: dto })
  }

  findAll() {
    return this.prisma.company.findMany()
  }
}
