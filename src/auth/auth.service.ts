import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import type { Role } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import { createHash, randomBytes } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'
import { readRefreshTokenTtlDays } from './auth-token-config'

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
    const refreshToken = this.createRefreshToken()
    const expiresAt = this.refreshExpiresAt()
    await this.prisma.authSession.create({
      data: { userId: user.id, refreshTokenHash: this.hashRefreshToken(refreshToken), expiresAt },
    })
    const accessToken = await this.signAccessToken(user.id, email, user.role)
    return {
      accessToken,
      refreshToken,
      refreshExpiresAt: expiresAt,
      // companyId solo es relevante para Role.COMPANY (ver User.companyId en
      // el schema); el resto de roles lo trae null. El front lo necesita para
      // armar CreateOfferDto sin tener que adivinar o listar todas las empresas.
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role as Role, companyId: user.companyId },
    }
  }

  async refresh(refreshToken: string | undefined) {
    if (!refreshToken) throw new UnauthorizedException('la sesión expiró')

    const oldHash = this.hashRefreshToken(refreshToken)
    const now = new Date()
    const session = await this.prisma.authSession.findUnique({
      where: { refreshTokenHash: oldHash },
      include: { user: true },
    })
    if (!session || session.revokedAt || session.expiresAt <= now) {
      throw new UnauthorizedException('la sesión expiró')
    }

    // El compare-and-swap hace de la renovación una operación de un solo uso:
    // dos peticiones concurrentes con el mismo token no pueden rotarlo ambas.
    const nextRefreshToken = this.createRefreshToken()
    const nextExpiresAt = this.refreshExpiresAt()
    const rotated = await this.prisma.authSession.updateMany({
      where: {
        id: session.id,
        refreshTokenHash: oldHash,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: { refreshTokenHash: this.hashRefreshToken(nextRefreshToken), expiresAt: nextExpiresAt },
    })
    if (rotated.count !== 1) throw new UnauthorizedException('la sesión expiró')

    return {
      accessToken: await this.signAccessToken(session.user.id, session.user.email, session.user.role),
      refreshToken: nextRefreshToken,
      refreshExpiresAt: nextExpiresAt,
    }
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return
    await this.prisma.authSession.updateMany({
      where: { refreshTokenHash: this.hashRefreshToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  private signAccessToken(userId: number, email: string, role: Role) {
    return this.jwt.signAsync({ sub: userId, email, role })
  }

  private createRefreshToken(): string {
    return randomBytes(32).toString('base64url')
  }

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex')
  }

  private refreshExpiresAt(): Date {
    return new Date(Date.now() + readRefreshTokenTtlDays() * 24 * 60 * 60 * 1000)
  }
}
