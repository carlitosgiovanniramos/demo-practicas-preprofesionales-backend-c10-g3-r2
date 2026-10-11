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
  offer: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  application: { count: vi.fn() },
  user: { findUnique: vi.fn() },
}
const companyOf: Record<number, number> = { 20: 100, 21: 200 }

const owner = { sub: 20, role: 'COMPANY' }
const otherCompany = { sub: 21, role: 'COMPANY' }
const coordinator = { sub: 1, role: 'COORDINATOR' }
const student = { sub: 30, role: 'STUDENT' }
const tutor = { sub: 40, role: 'TUTOR' }

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

  // La oferta 1 es de la empresa 100; su estado inicial depende de la operación.
  describe.each([
    ['publish', 'DRAFT'],
    ['close', 'PUBLISHED'],
  ])('PATCH /offers/:id/%s', (action, initialStatus) => {
    beforeEach(() => {
      prisma.offer.findUnique.mockResolvedValue({ id: 1, companyId: 100, status: initialStatus })
      prisma.offer.update.mockImplementation(({ data }) => Promise.resolve({ id: 1, companyId: 100, ...data }))
    })

    it.each([
      ['empresa ajena', 403, otherCompany],
      ['empresa dueña', 200, owner],
      ['coordinación', 200, coordinator],
    ])('como %s → %i', async (_label, expected, user) => {
      const res = await call('PATCH', `/offers/1/${action}`, user)
      expect(res.status).toBe(expected)
      expect(prisma.offer.update).toHaveBeenCalledTimes(expected === 200 ? 1 : 0)
    })
  })

  describe('flujos de lectura que siguen abiertos', () => {
    beforeEach(() => {
      prisma.offer.findMany.mockResolvedValue([])
    })

    it('GET /offers: el catálogo publicado sigue disponible para el estudiante', async () => {
      const res = await call('GET', '/offers', student)
      expect(res.status).toBe(200)
    })

    it('GET /offers/me: la empresa sigue viendo sus propias ofertas', async () => {
      const res = await call('GET', '/offers/me', owner)
      expect(res.status).toBe(200)
      expect(prisma.offer.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId: 100 } }))
    })
  })

  // H-04. La oferta 1 es de la empresa 100; el estudiante 30 no se postuló
  // salvo que el test lo diga.
  describe('GET /offers/:id', () => {
    const offerIn = (status: string) => ({ id: 1, companyId: 100, status, company: { id: 100, name: 'Empresa 100' } })

    beforeEach(() => {
      prisma.application.count.mockResolvedValue(0)
    })

    it.each([
      ['DRAFT', 'empresa ajena', 404, otherCompany],
      ['DRAFT', 'estudiante', 404, student],
      ['CLOSED', 'tutor', 404, tutor],
      ['DRAFT', 'empresa dueña', 200, owner],
      ['CLOSED', 'coordinación', 200, coordinator],
      ['PUBLISHED', 'estudiante', 200, student],
    ])('oferta %s como %s → %i', async (status, _label, expected, user) => {
      prisma.offer.findUnique.mockResolvedValue(offerIn(status))
      const res = await call('GET', '/offers/1', user)
      expect(res.status).toBe(expected)
    })

    it('un estudiante que se postuló sigue viendo la oferta CLOSED', async () => {
      prisma.offer.findUnique.mockResolvedValue(offerIn('CLOSED'))
      prisma.application.count.mockResolvedValue(1)
      const res = await call('GET', '/offers/1', student)
      expect(res.status).toBe(200)
      expect(prisma.application.count).toHaveBeenCalledWith({ where: { offerId: 1, studentId: 30 } })
    })

    it('no pide RUC ni correo de contacto de la empresa', async () => {
      prisma.offer.findUnique.mockResolvedValue(offerIn('PUBLISHED'))
      await call('GET', '/offers/1', student)
      expect(prisma.offer.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: { company: { select: { id: true, name: true } } },
      })
    })
  })
})
