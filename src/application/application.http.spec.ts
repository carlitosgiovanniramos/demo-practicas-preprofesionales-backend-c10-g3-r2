import { type INestApplication, ValidationPipe } from '@nestjs/common'
import { JwtModule, JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { HttpExceptionFilter } from '../common/http-exception.filter'
import { OfferService } from '../offer/offer.service'
import { PrismaService } from '../prisma/prisma.service'
import { ApplicationController } from './application.controller'
import { ApplicationService } from './application.service'

// Reproduce por HTTP el `curl` de E3-07: guards reales, Prisma mockeado.
// La oferta 1 es de la empresa 100; el usuario 20 es de ella y el 21 de otra.
const prisma = {
  application: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  offer: { findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
}
const companyOf: Record<number, number> = { 20: 100, 21: 200 }

describe('ApplicationController (HTTP) — pertenencia de la oferta', () => {
  let app: INestApplication
  let baseUrl: string
  let jwt: JwtService

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ global: true, secret: 'test-secret' })],
      controllers: [ApplicationController],
      providers: [
        ApplicationService,
        JwtAuthGuard,
        RolesGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: OfferService, useValue: { acceptedCount: vi.fn().mockResolvedValue(0) } },
      ],
    }).compile()
    app = moduleRef.createNestApplication()
    app.setGlobalPrefix('api')
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
    app.useGlobalFilters(new HttpExceptionFilter())
    await app.listen(0, '127.0.0.1')
    baseUrl = `${await app.getUrl()}/api`
    jwt = moduleRef.get(JwtService)
  })

  afterAll(() => app.close())

  beforeEach(() => {
    vi.clearAllMocks()
    prisma.offer.findUnique.mockResolvedValue({ id: 1, companyId: 100, seats: 3 })
    prisma.user.findUnique.mockImplementation(({ where }) =>
      Promise.resolve({ id: where.id, companyId: companyOf[where.id] ?? null }),
    )
    prisma.application.findUnique.mockResolvedValue({ id: 7, offerId: 1, status: 'SUBMITTED' })
    prisma.application.findMany.mockResolvedValue([{ id: 7, offerId: 1, studentId: 10, status: 'SUBMITTED' }])
    prisma.application.update.mockImplementation(({ data }) => Promise.resolve({ id: 7, ...data }))
  })

  const call = (method: string, path: string, user: { sub: number; role: string }, body?: unknown) =>
    fetch(`${baseUrl}${path}`, {
      method,
      headers: { authorization: `Bearer ${jwt.sign(user)}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })

  const owner = { sub: 20, role: 'COMPANY' }
  const otherCompany = { sub: 21, role: 'COMPANY' }
  const coordinator = { sub: 1, role: 'COORDINATOR' }

  it.each([
    ['empresa ajena', 403, otherCompany],
    ['empresa dueña', 200, owner],
    ['coordinación', 200, coordinator],
  ])('GET /offers/:offerId/applications como %s → %i', async (_label, expected, user) => {
    const res = await call('GET', '/offers/1/applications', user)
    expect(res.status).toBe(expected)
  })

  it.each([
    ['empresa ajena', 403, otherCompany],
    ['empresa dueña', 200, owner],
    ['coordinación', 200, coordinator],
  ])('PATCH /applications/:id/decide como %s → %i', async (_label, expected, user) => {
    const res = await call('PATCH', '/applications/7/decide', user, { status: 'REJECTED' })
    expect(res.status).toBe(expected)
    expect(prisma.application.update).toHaveBeenCalledTimes(expected === 200 ? 1 : 0)
  })

  it('GET /applications/me no pide RUC ni correo de contacto de la empresa', async () => {
    const res = await call('GET', '/applications/me', { sub: 10, role: 'STUDENT' })
    expect(res.status).toBe(200)
    expect(prisma.application.findMany).toHaveBeenCalledWith({
      where: { studentId: 10 },
      orderBy: { submittedAt: 'desc' },
      include: { offer: { include: { company: { select: { id: true, name: true } } } } },
    })
  })
})
