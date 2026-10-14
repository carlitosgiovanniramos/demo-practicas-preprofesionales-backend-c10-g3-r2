import { type INestApplication, ValidationPipe } from '@nestjs/common'
import { JwtModule, JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import * as bcrypt from 'bcryptjs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ApplicationController } from '../application/application.controller'
import { ApplicationService } from '../application/application.service'
import { AuthController } from '../auth/auth.controller'
import { AuthService } from '../auth/auth.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { OfferService } from '../offer/offer.service'
import { AccreditationService } from '../placement/accreditation.service'
import { PlacementController } from '../placement/placement.controller'
import { PlacementService } from '../placement/placement.service'
import { PrismaService } from '../prisma/prisma.service'
import { HttpExceptionFilter } from './http-exception.filter'

// Protege contra la regresión de la revisión de campos de usuario
// (openspec/changes/audit-autorizacion-e3-01/findings/revision-campos-usuario.md).
//
// Prisma se sustituye por un falso que proyecta como el real: con `select`
// devuelve solo lo pedido y con `include: { x: true }` la fila entera, hash de
// contraseña incluido. Si alguien vuelve a escribir `tutor: true` o quita un
// `select`, el campo sensible llega a la respuesta y este test falla.
const SENSITIVE_KEYS = ['password', 'refreshTokenHash']
const FIXTURE_SECRET = 'fixture-only'

type Row = Record<string, unknown>
type Args = { where?: Row; select?: Row; include?: Row } | undefined

let users: Row[] = []
const companies: Row[] = [{ id: 100, name: 'Empresa Uno', taxId: '20123456789', contactEmail: 'rrhh@uno.test' }]
const offers: Row[] = [{ id: 1, companyId: 100, title: 'Backend', seats: 2, status: 'PUBLISHED' }]
const applications: Row[] = [{ id: 7, offerId: 1, studentId: 10, status: 'ACCEPTED', motivation: 'Quiero aprender' }]
const placements: Row[] = [
  {
    id: 3,
    applicationId: 7,
    studentId: 10,
    tutorId: 40,
    companyId: 100,
    requiredHours: 240,
    status: 'ACTIVE',
    startDate: new Date('2026-03-01'),
    endDate: new Date('2026-06-30'),
    deletedAt: null,
  },
]

const tables: Record<string, () => Row[]> = {
  user: () => users,
  company: () => companies,
  offer: () => offers,
  application: () => applications,
  placement: () => placements,
  document: () => [],
  evaluation: () => [],
}

// Relaciones que las consultas de estos endpoints pueden pedir.
const relations: Record<string, Record<string, [model: string, resolve: (row: Row) => Row | Row[] | undefined]>> = {
  application: {
    student: ['user', (r) => users.find((u) => u.id === r.studentId)],
    offer: ['offer', (r) => offers.find((o) => o.id === r.offerId)],
  },
  offer: { company: ['company', (r) => companies.find((c) => c.id === r.companyId)] },
  placement: {
    student: ['user', (r) => users.find((u) => u.id === r.studentId)],
    tutor: ['user', (r) => users.find((u) => u.id === r.tutorId)],
    company: ['company', (r) => companies.find((c) => c.id === r.companyId)],
    documents: ['document', () => []],
    evaluations: ['evaluation', () => []],
  },
}

function shape(model: string, row: Row, args: Args): Row {
  const related = (key: string, nested: unknown) => {
    const [target, resolve] = relations[model][key]
    const value = resolve(row)
    const nestedArgs = nested === true ? undefined : (nested as Args)
    return Array.isArray(value) ? value.map((r) => shape(target, r, nestedArgs)) : value && shape(target, value, nestedArgs)
  }
  if (args?.select) {
    return Object.fromEntries(
      Object.entries(args.select)
        .filter(([, v]) => v)
        .map(([k, v]) => [k, relations[model]?.[k] ? related(k, v) : row[k]]),
    )
  }
  const out = { ...row }
  for (const [k, v] of Object.entries(args?.include ?? {})) if (v) out[k] = related(k, v)
  return out
}

// Solo igualdades simples; las condiciones con objetos (rangos de fecha) se ignoran.
const matches = (row: Row, where: Row = {}) =>
  Object.entries(where).every(([k, v]) => (v !== null && typeof v === 'object') || row[k] === v)

function fakeModel(model: string) {
  const find = (args: Args) => tables[model]().find((r) => matches(r, args?.where))
  return {
    findUnique: async (args: Args) => {
      const row = find(args)
      return row ? shape(model, row, args) : null
    },
    findFirst: async (args: Args) => {
      const row = find(args)
      return row ? shape(model, row, args) : null
    },
    findMany: async (args: Args) =>
      tables[model]()
        .filter((r) => matches(r, args?.where))
        .map((r) => shape(model, r, args)),
  }
}

const prisma = {
  user: fakeModel('user'),
  offer: fakeModel('offer'),
  application: fakeModel('application'),
  placement: fakeModel('placement'),
  hourLog: { aggregate: async () => ({ _sum: { hours: 0 } }) },
  // El login guarda la sesión aquí desde el #18 (sesiones con refresh).
  authSession: { create: async ({ data }: { data: Row }) => ({ id: 1, ...data }) },
}

function findSensitiveKeys(value: unknown, path = '$'): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => findSensitiveKeys(v, `${path}[${i}]`))
  if (value === null || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([k, v]) => [
    ...(SENSITIVE_KEYS.includes(k) ? [`${path}.${k}`] : []),
    ...findSensitiveKeys(v, `${path}.${k}`),
  ])
}

const student = { sub: 10, role: 'STUDENT' }
const company = { sub: 20, role: 'COMPANY' }
const coordinator = { sub: 1, role: 'COORDINATOR' }

describe('Respuestas sin campos sensibles de usuario', () => {
  let app: INestApplication
  let baseUrl: string
  let jwt: JwtService

  beforeAll(async () => {
    const password = await bcrypt.hash(FIXTURE_SECRET, 4)
    users = [
      { id: 1, email: 'coord@uni.test', fullName: 'Coordinación', role: 'COORDINATOR', companyId: null, password },
      { id: 10, email: 'ana@uni.test', fullName: 'Ana Estudiante', role: 'STUDENT', companyId: null, password },
      { id: 20, email: 'empresa@uno.test', fullName: 'Empresa Uno', role: 'COMPANY', companyId: 100, password },
      { id: 40, email: 'tutor@uni.test', fullName: 'Tutor Uno', role: 'TUTOR', companyId: null, password },
    ]

    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ global: true, secret: 'test-secret' })],
      controllers: [AuthController, ApplicationController, PlacementController],
      providers: [
        AuthService,
        ApplicationService,
        OfferService,
        PlacementService,
        AccreditationService,
        JwtAuthGuard,
        RolesGuard,
        { provide: PrismaService, useValue: prisma },
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

  const call = (method: string, path: string, user?: { sub: number; role: string }, body?: unknown) =>
    fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(user ? { authorization: `Bearer ${jwt.sign(user)}` } : {}),
        'content-type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })

  it('el falso de Prisma devuelve el hash con `include: true`, así que el test detecta la regresión', () => {
    const leaked = shape('placement', placements[0], { include: { tutor: true } })
    expect(findSensitiveKeys(leaked)).toEqual(['$.tutor.password'])
  })

  it.each([
    ['POST /auth/login', 'POST', '/auth/login', undefined, { email: 'ana@uni.test', password: FIXTURE_SECRET }],
    ['GET /offers/:offerId/applications', 'GET', '/offers/1/applications', company, undefined],
    ['GET /placements/me', 'GET', '/placements/me', student, undefined],
    ['GET /placements/accreditation', 'GET', '/placements/accreditation?period=2026-1', coordinator, undefined],
  ])('%s no incluye credenciales', async (_label, method, path, user, body) => {
    const res = await call(method, path, user, body)
    expect(res.ok).toBe(true)
    const json = await res.json()
    // Si la respuesta queda vacía, el test no estaría comprobando nada.
    expect(JSON.stringify(json)).toMatch(/fullName|studentName/)
    expect(findSensitiveKeys(json)).toEqual([])
  })
})
