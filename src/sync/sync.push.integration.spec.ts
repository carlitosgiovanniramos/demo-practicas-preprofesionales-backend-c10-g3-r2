import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { SyncOperationInput } from './dto/push.dto'
import { SyncService } from './sync.service'

// Test de integración real contra Postgres (docker-compose): reproduce D-01
// (KNOWN_ISSUES.md) mandando el mismo clientOpId dos veces, en secuencia y en
// paralelo, y verifica en base de datos que solo queda una fila. También
// prueba que la identidad de la operación es (userId, clientOpId): dos
// usuarios con el mismo UUID no deben compartir respuesta.
//
// Se salta si no hay DATABASE_URL: algunos runners de CI (p. ej. el quality
// gate de Yura, que corre `npm test` sin levantar Postgres) no tienen base de
// datos disponible. `pnpm test` local y el workflow `ci.yml` sí la tienen
// (ver docker-compose.yml / .github/workflows/ci.yml) y corren este test.
const hasDatabase = Boolean(process.env.DATABASE_URL)

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe.skipIf(!hasDatabase)('SyncService.push — idempotencia de clientOpId (D-01)', () => {
  const prisma = new PrismaClient()
  const service = new SyncService(prisma as never)

  // Los usuarios de este fixture no se autentican en el test; el hash es
  // solo para satisfacer la columna NOT NULL de la tabla.
  async function fixturePassword() {
    return bcrypt.hash('fixture-only', 1)
  }

  let studentId: number
  let otherStudentId: number
  let tutorId: number
  let companyId: number
  let offerId: number
  let applicationId: number
  let otherApplicationId: number
  let placementId: number
  let otherPlacementId: number

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

    const offer = await prisma.offer.create({
      data: {
        companyId,
        title: 'Oferta integración D-01',
        description: 'Fixture de test de integración para el fix de D-01.',
        modality: 'PRESENCIAL',
        seats: 2,
        requiredHours: 240,
        periodStart: new Date('2026-03-01'),
        periodEnd: new Date('2026-07-31'),
      },
    })
    offerId = offer.id

    async function createStudentWithPlacement(label: string) {
      const student = await prisma.user.create({
        data: { email: `${label}-${stamp}@integracion.test`, password, fullName: `Estudiante ${label} D-01` },
      })
      const application = await prisma.application.create({
        data: { offerId, studentId: student.id, motivation: 'Fixture de test de integración.' },
      })
      const placement = await prisma.placement.create({
        data: {
          applicationId: application.id,
          studentId: student.id,
          tutorId,
          companyId,
          startDate: new Date('2026-03-01'),
          endDate: new Date('2026-07-31'),
          requiredHours: 240,
        },
      })
      return { studentId: student.id, applicationId: application.id, placementId: placement.id }
    }

    const a = await createStudentWithPlacement('estudiante-a')
    studentId = a.studentId
    applicationId = a.applicationId
    placementId = a.placementId

    const b = await createStudentWithPlacement('estudiante-b')
    otherStudentId = b.studentId
    otherApplicationId = b.applicationId
    otherPlacementId = b.placementId
  })

  afterAll(async () => {
    await prisma.syncOperation.deleteMany({ where: { userId: { in: [studentId, otherStudentId] } } })
    await prisma.hourLog.deleteMany({ where: { placementId: { in: [placementId, otherPlacementId] } } })
    await prisma.placement.deleteMany({ where: { id: { in: [placementId, otherPlacementId] } } })
    await prisma.application.deleteMany({ where: { id: { in: [applicationId, otherApplicationId] } } })
    await prisma.offer.delete({ where: { id: offerId } })
    await prisma.user.deleteMany({ where: { id: { in: [studentId, otherStudentId, tutorId] } } })
    await prisma.company.delete({ where: { id: companyId } })
    await prisma.$disconnect()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // Nest serializa la respuesta a JSON antes de mandarla por HTTP, así que
  // "indistinguible desde el punto de vista del cliente" se compara sobre esa
  // forma (p. ej. Date -> string ISO), no sobre los objetos en memoria.
  function asJson<T>(value: T): unknown {
    return JSON.parse(JSON.stringify(value))
  }

  function createOp(clientOpId: string, activity: string, targetPlacementId: number = placementId): SyncOperationInput {
    return {
      clientOpId,
      entity: 'hourLog',
      op: 'create',
      baseVersion: null,
      payload: { placementId: targetPlacementId, date: '2026-04-02', startTime: '08:00', endTime: '12:00', hours: 4, activity },
    }
  }

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

  it('dos usuarios con el mismo clientOpId no comparten la operación (aislamiento por userId)', async () => {
    const sharedClientOpId = crypto.randomUUID()
    const opA = createOp(sharedClientOpId, 'Soporte — usuario A', placementId)
    const opB = createOp(sharedClientOpId, 'Soporte — usuario B', otherPlacementId)

    const resultA = await service.push(studentId, [opA])
    const resultB = await service.push(otherStudentId, [opB])

    // Cada quien recibe SU propia respuesta — B nunca ve la de A.
    expect(resultA.results[0]).toMatchObject({ status: 'applied', server: expect.objectContaining({ activity: 'Soporte — usuario A' }) })
    expect(resultB.results[0]).toMatchObject({ status: 'applied', server: expect.objectContaining({ activity: 'Soporte — usuario B' }) })
    expect(asJson(resultA.results[0])).not.toEqual(asJson(resultB.results[0]))

    const rowsA = await prisma.hourLog.findMany({ where: { placementId, activity: 'Soporte — usuario A' } })
    const rowsB = await prisma.hourLog.findMany({ where: { placementId: otherPlacementId, activity: 'Soporte — usuario B' } })
    expect(rowsA).toHaveLength(1)
    expect(rowsB).toHaveLength(1)

    // Mismo clientOpId, pero una fila por usuario: la PK es (userId, clientOpId).
    const syncRows = await prisma.syncOperation.findMany({ where: { clientOpId: sharedClientOpId } })
    expect(syncRows).toHaveLength(2)
    expect(new Set(syncRows.map((r) => r.userId))).toEqual(new Set([studentId, otherStudentId]))
  })

  it('dos envíos concurrentes con el mismo clientOpId dejan una sola fila y revierten al perdedor', async () => {
    const op = createOp(crypto.randomUUID(), 'Soporte — envíos concurrentes')

    // Barrera determinística: sin esto, Promise.all no garantiza que ambas
    // llamadas lean "no existe" antes de que cualquiera comprometa su
    // transacción — la segunda podría leer después del commit de la primera
    // y tomar el camino secuencial, sin ejercitar nunca el P2002 ni el
    // rollback. Retrasamos la entrada a $transaction (no el trabajo real
    // adentro) lo suficiente para que ambas lecturas previas ya hayan
    // ocurrido, forzando la colisión real en la base de datos.
    const realTransaction = prisma.$transaction.bind(prisma)
    const transactionSpy = vi.spyOn(prisma, '$transaction').mockImplementation(async (...args: Parameters<typeof realTransaction>) => {
      await sleep(150)
      return realTransaction(...args)
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- espía sobre un método privado, solo para el test.
    const recoverSpy = vi.spyOn(SyncService.prototype as any, 'recoverFromFailedApply')

    const [a, b] = await Promise.all([service.push(studentId, [op]), service.push(studentId, [op])])

    // Prueba que hubo una carrera real, no un atajo secuencial: ambas
    // llamadas entraron a $transaction (es decir, ambas corrieron
    // applyOperation)...
    expect(transactionSpy).toHaveBeenCalledTimes(2)
    // ...pero solo una tuvo que recuperarse de la violación de unicidad —
    // la otra transacción sí comprometió limpio.
    expect(recoverSpy).toHaveBeenCalledTimes(1)

    expect(a.results[0]).toMatchObject({ status: 'applied' })
    expect(asJson(a.results[0])).toEqual(asJson(b.results[0]))

    // La transacción perdedora se revirtió: pese a que ambas ejecutaron
    // applyOperation (y por lo tanto hourLog.create) dentro de su propia
    // transacción, solo persiste una fila.
    const rows = await prisma.hourLog.findMany({ where: { placementId, activity: op.payload.activity as string } })
    expect(rows).toHaveLength(1)

    const syncRows = await prisma.syncOperation.findMany({ where: { clientOpId: op.clientOpId } })
    expect(syncRows).toHaveLength(1)
  })
})
