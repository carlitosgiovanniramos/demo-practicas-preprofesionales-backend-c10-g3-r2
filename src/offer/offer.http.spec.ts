import { type INestApplication, ValidationPipe } from '@nestjs/common'
import { JwtModule, JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { HttpExceptionFilter } from '../common/http-exception.filter'
import { PrismaService } from '../prisma/prisma.service'
import { OfferController } from './offer.controller'
import { OfferService } from './offer.service'

// Reproduce por HTTP los `curl` de E3-XX: guards reales, Prisma mockeado.
// El usuario 20 es de la empresa 100 y el 21 de la empresa 200.
const prisma = {
  offer: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn() },
}
const companyOf: Record<number, number> = { 20: 100, 21: 200 }

const owner = { sub: 20, role: 'COMPANY' }
const otherCompany = { sub: 21, role: 'COMPANY' }
const coordinator = { sub: 1, role: 'COORDINATOR' }

describe('OfferController (HTTP) — pertenencia de la oferta', () => {
  let app: INestApplication
  let baseUrl: string
  let jwt: JwtService

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ global: true, secret: 'test-secret' })],
      controllers: [OfferController],
      providers: [OfferService, JwtAuthGuard, RolesGuard, { provide: PrismaService, useValue: prisma }],
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
    prisma.user.findUnique.mockImplementation(({ where }) =>
      Promise.resolve({ id: where.id, companyId: companyOf[where.id] ?? null }),
    )
    prisma.offer.create.mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data }))
  })

  const call = (method: string, path: string, user: { sub: number; role: string }, body?: unknown) =>
    fetch(`${baseUrl}${path}`, {
      method,
      headers: { authorization: `Bearer ${jwt.sign(user)}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })

  describe('POST /offers', () => {
    const body = {
      companyId: 100,
      title: 'Backend',
      description: 'API de prácticas',
      modality: 'remoto',
      seats: 2,
      requiredHours: 240,
      periodStart: '2026-11-01',
      periodEnd: '2027-02-28',
    }

    it.each([
      ['empresa ajena', 403, otherCompany],
      ['empresa dueña', 201, owner],
      ['coordinación', 201, coordinator],
    ])('con companyId 100 como %s → %i', async (_label, expected, user) => {
      const res = await call('POST', '/offers', user, body)
      expect(res.status).toBe(expected)
      expect(prisma.offer.create).toHaveBeenCalledTimes(expected === 201 ? 1 : 0)
    })

    it('sin companyId, una empresa crea a nombre propio', async () => {
      const res = await call('POST', '/offers', otherCompany, { ...body, companyId: undefined })
      expect(res.status).toBe(201)
      expect(await res.json()).toMatchObject({ companyId: 200, status: 'DRAFT' })
    })
  })
})
