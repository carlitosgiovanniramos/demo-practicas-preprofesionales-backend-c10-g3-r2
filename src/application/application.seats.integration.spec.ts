import 'dotenv/config'
import { BadRequestException } from '@nestjs/common'
import { ApplicationStatus, PrismaClient, Role } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { OfferService } from '../offer/offer.service'
import { ApplicationService } from './application.service'

// Test de integración real contra Postgres (docker-compose) que fija que
// ApplicationService.decide() no permite el sobrecupo de cupos.
//
// Reproducía el bug D-08; desde que el trigger `applications_enforce_offer_seats`
// sostiene el límite, afirma lo contrario: de dos aceptaciones concurrentes solo
// una pasa.
//
// La barrera sigue siendo válida con ese arreglo, y es parte de por qué se
// eligió: el conteo del servicio se lee igual que antes, sin bloqueos, así que
// las dos llamadas llegan a ella. El bloqueo ocurre después, ya dentro del
// UPDATE. Un `SELECT ... FOR UPDATE` en el servicio habría detenido a la
// segunda llamada antes de llegar, y la barrera habría expirado.
//
// La ventana que tenía el bug estaba entre la lectura del conteo y la escritura:
//   - application.service.ts:77  lee cuántas postulaciones hay ACCEPTED (conteo en offer.service.ts:123-127)
//   - application.service.ts:78  compara contra offer.seats
//   - application.service.ts:81  escribe ACCEPTED (update por id, sin guarda)
// Dos aceptaciones que leían el conteo antes de que cualquiera escribiera veían
// la misma plaza libre y ambas pasaban.
//
// La prueba fuerza ese entrelazado sin depender del azar ni del reloj: una
// barrera de dos partes retiene a cada aceptación justo después de su lectura
// real del conteo y las libera juntas. Ninguna escribe hasta que ambas leyeron.
//
// Se salta si no hay DATABASE_URL, igual que sync.push.integration.spec.ts.
// Los requisitos para correrla: KNOWN_ISSUES.md, sección D-08.
const hasDatabase = Boolean(process.env.DATABASE_URL)

// Retiene a cada llamador hasta que lleguen `parties` y los libera a todos a la
// vez. El tope `timeoutMs` solo convierte un bloqueo en un fallo con mensaje.
function barrier(parties: number, timeoutMs = 3000) {
  let arrived = 0
  let open!: () => void
  const opened = new Promise<void>((resolve) => {
    open = resolve
  })

  return async function arrive() {
    arrived += 1
    if (arrived >= parties) {
      open()
      return
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`barrera: solo ${arrived} de ${parties} llamadas llegaron a acceptedCount`)),
        timeoutMs,
      )
    })
    try {
      await Promise.race([opened, timedOut])
    } finally {
      clearTimeout(timer)
    }
  }
}

describe.skipIf(!hasDatabase)('ApplicationService.decide: sobrecupo por concurrencia', () => {
  const prisma = new PrismaClient()
  const stamp = Date.now()
  const offerIds: number[] = []
  const userIds: number[] = []
  let companyId: number
  let coordinatorId: number

  beforeAll(async () => {
    const password = await bcrypt.hash('fixture-only', 1)
    const company = await prisma.company.create({
      data: { taxId: `SEATS-${stamp}`, name: 'Empresa integración cupos', sector: 'Software', contactEmail: `cupos-${stamp}@integracion.test` },
    })
    companyId = company.id
    const coordinator = await prisma.user.create({
      data: { email: `coord-cupos-${stamp}@integracion.test`, password, fullName: 'Coordinación cupos', role: Role.COORDINATOR },
    })
    coordinatorId = coordinator.id
    userIds.push(coordinator.id)
  })

  afterAll(async () => {
    await prisma.application.deleteMany({ where: { offerId: { in: offerIds } } })
    await prisma.offer.deleteMany({ where: { id: { in: offerIds } } })
    await prisma.user.deleteMany({ where: { id: { in: userIds } } })
    await prisma.company.delete({ where: { id: companyId } })
    await prisma.$disconnect()
  })

  // Oferta con `seats` plazas y dos estudiantes postulados (SUBMITTED).
  async function createOfferWithTwoApplications(seats: number) {
    const offer = await prisma.offer.create({
      data: {
        companyId,
        title: `Oferta cupos ${seats} (${offerIds.length + 1})`,
        description: 'Fixture de integración para el sobrecupo de cupos.',
        modality: 'PRESENCIAL',
        seats,
        requiredHours: 240,
        periodStart: new Date('2026-03-01'),
        periodEnd: new Date('2026-07-31'),
      },
    })
    offerIds.push(offer.id)

    const applicationIds: number[] = []
    for (const label of ['a', 'b']) {
      const student = await prisma.user.create({
        data: {
          email: `estudiante-${label}-${stamp}-${offer.id}@integracion.test`,
          password: await bcrypt.hash('fixture-only', 1),
          fullName: `Estudiante ${label} cupos`,
        },
      })
      userIds.push(student.id)
      const application = await prisma.application.create({
        data: { offerId: offer.id, studentId: student.id, motivation: 'Fixture de integración.' },
      })
      applicationIds.push(application.id)
    }
    return { offerId: offer.id, applicationIds }
  }

  it('dos aceptaciones concurrentes sobre una plaza libre: solo una pasa', async () => {
    const { offerId, applicationIds } = await createOfferWithTwoApplications(1)
    const [applicationA, applicationB] = applicationIds

    // Ambas aceptaciones comparten la misma instancia de OfferService. La
    // barrera se pone DESPUÉS de la lectura real del conteo: el conteo es real,
    // pero ninguna llamada puede escribir antes de que la otra también lo leyera.
    const offers = new OfferService(prisma as never)
    const arrive = barrier(2)
    const realAcceptedCount = offers.acceptedCount.bind(offers)
    vi.spyOn(offers, 'acceptedCount').mockImplementation(async (id: number) => {
      const count = await realAcceptedCount(id)
      await arrive()
      return count
    })
    const service = new ApplicationService(prisma as never, offers)

    const results = await Promise.allSettled([
      service.decide(applicationA, ApplicationStatus.ACCEPTED, coordinatorId, Role.COORDINATOR),
      service.decide(applicationB, ApplicationStatus.ACCEPTED, coordinatorId, Role.COORDINATOR),
    ])

    // Las dos leen el conteo y ven la plaza libre, pero solo una la toma: la
    // otra choca con la restricción al incrementar `acceptedSeats`.
    const estados = results.map((r) => r.status).sort()
    expect(estados).toEqual(['fulfilled', 'rejected'])

    // Y la que pierde recibe el motivo real, no un fallo de base de datos.
    const perdedora = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
    expect(perdedora.reason).toBeInstanceOf(BadRequestException)
    expect(perdedora.reason.message).toBe('la oferta ya no tiene cupos')

    // En base de datos queda 1 aceptada para una oferta de 1 plaza.
    const accepted = await prisma.application.count({
      where: { offerId, status: ApplicationStatus.ACCEPTED },
    })
    const offer = await prisma.offer.findUniqueOrThrow({ where: { id: offerId } })
    expect(accepted).toBe(1)
    expect(accepted).toBeLessThanOrEqual(offer.seats)
  })

  it('control: en secuencia la segunda aceptación sí se rechaza por falta de cupo', async () => {
    const { offerId, applicationIds } = await createOfferWithTwoApplications(1)
    const [applicationA, applicationB] = applicationIds
    const service = new ApplicationService(prisma as never, new OfferService(prisma as never))

    await service.decide(applicationA, ApplicationStatus.ACCEPTED, coordinatorId, Role.COORDINATOR)
    await expect(
      service.decide(applicationB, ApplicationStatus.ACCEPTED, coordinatorId, Role.COORDINATOR),
    ).rejects.toThrow('la oferta ya no tiene cupos')

    const accepted = await prisma.application.count({
      where: { offerId, status: ApplicationStatus.ACCEPTED },
    })
    expect(accepted).toBe(1)
  })
})
