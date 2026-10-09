import { Injectable } from '@nestjs/common'
import { Role } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type { CreateCompanyDto } from './dto/create-company.dto'

@Injectable()
export class CompanyService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateCompanyDto) {
    return this.prisma.company.create({ data: dto })
  }

  // La coordinación ve el directorio completo; una empresa solo la suya, que
  // es lo que el front usa para su encabezado. El resto de roles lo frena el
  // guard (H-08).
  findAll(userId: number, role: Role) {
    const where = role === Role.COORDINATOR ? undefined : { users: { some: { id: userId } } }
    return this.prisma.company.findMany({ where })
  }
}
