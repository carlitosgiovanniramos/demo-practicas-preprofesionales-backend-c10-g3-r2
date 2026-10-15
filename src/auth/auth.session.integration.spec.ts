import 'dotenv/config'
import { UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { PrismaClient, Role } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AuthService } from './auth.service'

const hasDatabase = Boolean(process.env.DATABASE_URL)

describe.skipIf(!hasDatabase)('AuthService refresh sessions: PostgreSQL', () => {
  const prisma = new PrismaClient()
  const service = new AuthService(
    prisma as never,
    new JwtService({ secret: 'integration-test-secret', signOptions: { expiresIn: 60 } }),
  )
  const email = `auth-session-${Date.now()}@integration.test`
  let userId: number

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email, password: await bcrypt.hash('integration-only', 4), fullName: 'Auth Integration', role: Role.STUDENT },
    })
    userId = user.id
  })

  afterAll(async () => {
    if (userId) {
      await prisma.authSession.deleteMany({ where: { userId } })
      await prisma.user.delete({ where: { id: userId } })
    }
    await prisma.$disconnect()
  })

  it('allows only one concurrent refresh with the same token and revokes the replacement on logout', async () => {
    const loggedIn = await service.login(email, 'integration-only')
    const attempts = await Promise.allSettled([
      service.refresh(loggedIn.refreshToken),
      service.refresh(loggedIn.refreshToken),
    ])
    const succeeded = attempts.filter((attempt) => attempt.status === 'fulfilled')
    const failed = attempts.filter((attempt) => attempt.status === 'rejected')

    expect(succeeded).toHaveLength(1)
    expect(failed).toHaveLength(1)
    expect((failed[0] as PromiseRejectedResult).reason).toBeInstanceOf(UnauthorizedException)

    const renewed = (succeeded[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof service.refresh>>>).value
    expect(renewed.refreshToken).not.toBe(loggedIn.refreshToken)
    await service.logout(renewed.refreshToken)
    await expect(service.refresh(renewed.refreshToken)).rejects.toThrow(UnauthorizedException)
  })

  it('rejects a refresh token after its stored expiry', async () => {
    const loggedIn = await service.login(email, 'integration-only')
    await prisma.authSession.updateMany({
      where: { userId },
      data: { expiresAt: new Date(Date.now() - 1) },
    })

    await expect(service.refresh(loggedIn.refreshToken)).rejects.toThrow(UnauthorizedException)
  })
})
