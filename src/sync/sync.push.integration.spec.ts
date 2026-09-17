import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SyncOperationInput } from './dto/push.dto'
import { SyncService } from './sync.service'

// Test de integración real contra Postgres (docker-compose): reproduce D-01
// (KNOWN_ISSUES.md) mandando el mismo clientOpId dos veces, en secuencia y en
// paralelo, y verifica en base de datos que solo queda una fila.
const prisma = new PrismaClient()
const service = new SyncService(prisma as never)

// Los usuarios de este fixture no se autentican en el test; el hash es solo
// para satisfacer la columna NOT NULL de la tabla.
async function fixturePassword() {
  return bcrypt.hash('fixture-only', 1)
}

let studentId: number
let tutorId: number
let companyId: number
let offerId: number
let applicationId: number
let placementId: number

beforeAll(async () => {
  const stamp = Date.now()
  const password = await fixturePassword()

  const company = await prisma.company.create({
    data: { taxId: `TEST-${stamp}`, name: 'Empresa Integración D-01', sector: 'Software', contactEmail: `rrhh-${stamp}@integracion.test` },
  })
  companyId = company.id

  const tutor = await prisma.user.create({
    data: { email: `tutor-${stamp}@integracion.test`, password, fullName: 'Tutor Integración D-01' },
  })
  tutorId = tutor.id

  const student = await prisma.user.create({
    data: { email: `estudiante-${stamp}@integracion.test`, password, fullName: 'Estudiante Integración D-01' },
  })
  studentId = student.id

  const offer = await prisma.offer.create({
    data: {
      companyId,
      title: 'Oferta integración D-01',
      description: 'Fixture de test de integración para el fix de D-01.',
      modality: 'PRESENCIAL',
      seats: 1,
      requiredHours: 240,
      periodStart: new Date('2026-03-01'),
      periodEnd: new Date('2026-07-31'),
    },
  })
  offerId = offer.id

  const application = await prisma.application.create({
    data: { offerId, studentId, motivation: 'Fixture de test de integración.' },
  })
  applicationId = application.id

  const placement = await prisma.placement.create({
    data: {
      applicationId,
      studentId,
      tutorId,
      companyId,
      startDate: new Date('2026-03-01'),
      endDate: new Date('2026-07-31'),
      requiredHours: 240,
    },
  })
  placementId = placement.id
})

afterAll(async () => {
  await prisma.syncOperation.deleteMany({ where: { userId: studentId } })
  await prisma.hourLog.deleteMany({ where: { placementId } })
  await prisma.placement.delete({ where: { id: placementId } })
  await prisma.application.delete({ where: { id: applicationId } })
  await prisma.offer.delete({ where: { id: offerId } })
  await prisma.user.delete({ where: { id: studentId } })
  await prisma.user.delete({ where: { id: tutorId } })
  await prisma.company.delete({ where: { id: companyId } })
  await prisma.$disconnect()
})

// Nest serializa la respuesta a JSON antes de mandarla por HTTP, así que
// "indistinguible desde el punto de vista del cliente" se compara sobre esa
// forma (p. ej. Date -> string ISO), no sobre los objetos en memoria.
function asJson<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value))
}

function createOp(clientOpId: string, activity: string): SyncOperationInput {
  return {
    clientOpId,
    entity: 'hourLog',
    op: 'create',
    baseVersion: null,
    payload: { placementId, date: '2026-04-02', startTime: '08:00', endTime: '12:00', hours: 4, activity },
  }
}

describe('SyncService.push — idempotencia de clientOpId (D-01)', () => {
  it('un reintento secuencial con el mismo clientOpId no crea una fila nueva', async () => {
    const op = createOp(crypto.randomUUID(), 'Soporte — reintento secuencial')

    const first = await service.push(studentId, [op])
    const second = await service.push(studentId, [op])

    expect(first.results[0]).toMatchObject({ status: 'applied' })
    // La respuesta del reintento es indistinguible de la primera.
    expect(asJson(second.results[0])).toEqual(asJson(first.results[0]))

    const rows = await prisma.hourLog.findMany({ where: { placementId, activity: op.payload.activity as string } })
    expect(rows).toHaveLength(1)

    const syncRows = await prisma.syncOperation.findMany({ where: { clientOpId: op.clientOpId } })
    expect(syncRows).toHaveLength(1)
  })

  it('dos envíos concurrentes con el mismo clientOpId dejan una sola fila', async () => {
    const op = createOp(crypto.randomUUID(), 'Soporte — envíos concurrentes')

    const [a, b] = await Promise.all([service.push(studentId, [op]), service.push(studentId, [op])])

    expect(a.results[0]).toMatchObject({ status: 'applied' })
    expect(asJson(a.results[0])).toEqual(asJson(b.results[0]))

    const rows = await prisma.hourLog.findMany({ where: { placementId, activity: op.payload.activity as string } })
    expect(rows).toHaveLength(1)

    const syncRows = await prisma.syncOperation.findMany({ where: { clientOpId: op.clientOpId } })
    expect(syncRows).toHaveLength(1)
  })
})
