import { type INestApplication, ValidationPipe } from '@nestjs/common'
import { JwtModule, JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { HttpExceptionFilter } from '../common/http-exception.filter'
import { PrismaService } from '../prisma/prisma.service'
import { CompanyController } from './company.controller'
import { CompanyService } from './company.service'

// Reproduce por HTTP el `curl` de H-08: guards reales, Prisma mockeado.
const prisma = { company: { findMany: vi.fn(), create: vi.fn() } }

const student = { sub: 30, role: 'STUDENT' }
const tutor = { sub: 40, role: 'TUTOR' }
const company = { sub: 20, role: 'COMPANY' }
const coordinator = { sub: 1, role: 'COORDINATOR' }

describe('CompanyController (HTTP) — visibilidad del directorio de empresas', () => {
  let app: INestApplication
  let baseUrl: string
  let jwt: JwtService

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ global: true, secret: 'test-secret' })],
      controllers: [CompanyController],
      providers: [CompanyService, JwtAuthGuard, RolesGuard, { provide: PrismaService, useValue: prisma }],
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
    prisma.company.findMany.mockResolvedValue([])
    prisma.company.create.mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data }))
  })

  const call = (method: string, path: string, user: { sub: number; role: string }, body?: unknown) =>
    fetch(`${baseUrl}${path}`, {
      method,
      headers: { authorization: `Bearer ${jwt.sign(user)}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })

  describe('GET /companies', () => {
    it.each([
      ['estudiante', student],
      ['tutor', tutor],
    ])('como %s → 403, sin consultar empresas', async (_label, user) => {
      const res = await call('GET', '/companies', user)
      expect(res.status).toBe(403)
      expect(prisma.company.findMany).not.toHaveBeenCalled()
    })

    it('como empresa → 200, solo con su propia empresa', async () => {
      const res = await call('GET', '/companies', company)
      expect(res.status).toBe(200)
      expect(prisma.company.findMany).toHaveBeenCalledWith({ where: { users: { some: { id: 20 } } } })
    })

    it('como coordinación → 200, con el directorio completo', async () => {
      const res = await call('GET', '/companies', coordinator)
      expect(res.status).toBe(200)
      expect(prisma.company.findMany).toHaveBeenCalledWith({ where: undefined })
    })
  })

  describe('POST /companies', () => {
    const body = { taxId: '1790000001001', name: 'Empresa 1', sector: 'Software', contactEmail: 'rrhh@empresa1.com' }

    it.each([
      ['empresa', 403, company],
      ['coordinación', 201, coordinator],
    ])('como %s → %i', async (_label, expected, user) => {
      const res = await call('POST', '/companies', user, body)
      expect(res.status).toBe(expected)
      expect(prisma.company.create).toHaveBeenCalledTimes(expected === 201 ? 1 : 0)
    })
  })
})
