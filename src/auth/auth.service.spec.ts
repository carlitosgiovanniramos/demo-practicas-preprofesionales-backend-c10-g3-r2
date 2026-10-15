import { UnauthorizedException } from '@nestjs/common'
import * as bcrypt from 'bcryptjs'
import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthService } from './auth.service'

// Smell deliberado: mockeamos PrismaService completo, así que estos tests
// no ejercitan SQL real y no detectan N+1 ni races.
const prisma = {
  user: { findUnique: vi.fn() },
  authSession: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
}
const jwt = { signAsync: vi.fn().mockResolvedValue('token-firmado') }

describe('AuthService.login', () => {
  let service: AuthService

  beforeEach(() => {
    vi.clearAllMocks()
    prisma.authSession.create.mockResolvedValue({})
    service = new AuthService(prisma as never, jwt as never)
  })

  it('returns an access token and the user for valid credentials', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 1, email: 'tutor0@miyura.com', password: await bcrypt.hash('yura1234', 10),
      fullName: 'Tutor Académico 0', role: 'TUTOR',
    })

    const result = await service.login('tutor0@miyura.com', 'yura1234')

    expect(result.accessToken).toBe('token-firmado')
    expect(result.refreshToken).toMatch(/^[\w-]{43}$/)
    expect(prisma.authSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 1,
        refreshTokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        expiresAt: expect.any(Date),
      }),
    })
    expect(result.user).toEqual({ id: 1, email: 'tutor0@miyura.com', fullName: 'Tutor Académico 0', role: 'TUTOR' })
  })

  it('includes companyId for a COMPANY user', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 2, email: 'empresa0@miyura.com', password: await bcrypt.hash('yura1234', 10),
      fullName: 'Empresa 0', role: 'COMPANY', companyId: 1,
    })

    const result = await service.login('empresa0@miyura.com', 'yura1234')

    expect(result.user).toEqual({
      id: 2, email: 'empresa0@miyura.com', fullName: 'Empresa 0', role: 'COMPANY', companyId: 1,
    })
  })

  it('throws Unauthorized when the password does not match', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 1, email: 'tutor0@miyura.com', password: await bcrypt.hash('otra', 10),
      fullName: 'Tutor Académico 0', role: 'TUTOR',
    })

    await expect(service.login('tutor0@miyura.com', 'yura1234')).rejects.toThrow(UnauthorizedException)
  })

  it('rotates a valid refresh token and hashes the replacement in storage', async () => {
    const previous = 'previous-refresh-token'
    const previousHash = createHash('sha256').update(previous).digest('hex')
    prisma.authSession.findUnique.mockResolvedValue({
      id: 'session-1',
      refreshTokenHash: previousHash,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      user: { id: 3, email: 'tutor@miyura.com', role: 'TUTOR' },
    })
    prisma.authSession.updateMany.mockResolvedValue({ count: 1 })

    const result = await service.refresh(previous)

    expect(result.accessToken).toBe('token-firmado')
    expect(result.refreshToken).not.toBe(previous)
    expect(prisma.authSession.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: 'session-1', refreshTokenHash: previousHash, revokedAt: null }),
      data: expect.objectContaining({ refreshTokenHash: expect.not.stringMatching(previousHash) }),
    })
  })

  it('rejects a replayed refresh token when another request already rotated it', async () => {
    const previous = 'replayed-refresh-token'
    prisma.authSession.findUnique.mockResolvedValue({
      id: 'session-1',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      user: { id: 3, email: 'tutor@miyura.com', role: 'TUTOR' },
    })
    prisma.authSession.updateMany.mockResolvedValue({ count: 0 })

    await expect(service.refresh(previous)).rejects.toThrow(UnauthorizedException)
  })

  it('rejects an expired refresh token', async () => {
    prisma.authSession.findUnique.mockResolvedValue({
      id: 'session-1', expiresAt: new Date(Date.now() - 1), revokedAt: null,
      user: { id: 3, email: 'tutor@miyura.com', role: 'TUTOR' },
    })

    await expect(service.refresh('expired-refresh-token')).rejects.toThrow(UnauthorizedException)
    expect(prisma.authSession.updateMany).not.toHaveBeenCalled()
  })

  it('revokes the refresh session on logout', async () => {
    prisma.authSession.updateMany.mockResolvedValue({ count: 1 })
    const token = 'refresh-token-to-revoke'

    await service.logout(token)

    expect(prisma.authSession.updateMany).toHaveBeenCalledWith({
      where: { refreshTokenHash: createHash('sha256').update(token).digest('hex'), revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    })
  })
})
