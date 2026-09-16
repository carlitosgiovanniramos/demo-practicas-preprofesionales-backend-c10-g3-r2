import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import type { Role } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } })
    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new UnauthorizedException('credenciales inválidas')
    }
    const accessToken = await this.jwt.signAsync({ sub: user.id, email, role: user.role })
    return {
      accessToken,
      // companyId solo es relevante para Role.COMPANY (ver User.companyId en
      // el schema); el resto de roles lo trae null. El front lo necesita para
      // armar CreateOfferDto sin tener que adivinar o listar todas las empresas.
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role as Role, companyId: user.companyId },
    }
  }
}
