import 'dotenv/config'
import { PrismaClient, Role } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { OfferService } from '../offer/offer.service'
import { ApplicationService } from './application.service'

// Test de integración real contra Postgres (docker-compose) para D-04.
//
// La pantalla de postulaciones de una oferta resolvía al candidato con una
// consulta por fila: 200 postulantes, 200 viajes a la base. El arreglo pide
// el candidato dentro de la misma consulta de la lista.
//
// Lo que fija esta prueba es la propiedad que importa, no un número concreto:
// la cantidad de consultas no puede depender de cuántos postulantes haya. Por
// eso mide la misma pantalla dos veces, con 5 y con 200, y compara. Un número
// fijo quedaría obsoleto en cuanto Prisma cambiara cómo resuelve la relación;
// la comparación sigue siendo válida igual.
//
// Se salta si no hay DATABASE_URL, igual que el resto de pruebas de integración.
const hasDatabase = Boolean(process.env.DATABASE_URL)

// Tope de la tarea G3-20: con 200 postulaciones, por debajo de 500 ms en local.
const TOPE_MS = 500
const POSTULANTES_MUCHOS = 200
const POSTULANTES_POCOS = 5

describe.skipIf(!hasDatabase)('ApplicationService.listByOffer: una consulta, no una por candidato (D-04)', () => {
  const prisma = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] })
  const stamp = Date.now()
  const offerIds: number[] = []
  const userIds: number[] = []
  let companyId: number
  let coordinatorId: number
  let service: ApplicationService
  let ofertaPocos: number
  let ofertaMuchos: number
  // Relleno del campo obligatorio `password` de los usuarios de prueba.
  let relleno: string

  // El contador solo corre mientras se mide: el armado de los fixtures también
  // dispara consultas y ensuciaría la cuenta.
  const consultas: string[] = []
  let contando = false
  prisma.$on('query', (event) => {
    if (contando) consultas.push(event.query)
  })

  async function medirPantalla(offerId: number) {
    consultas.length = 0
    contando = true
    const inicio = performance.now()
    const filas = await service.listByOffer(offerId, coordinatorId, Role.COORDINATOR)
    const ms = performance.now() - inicio
    contando = false
    return { filas, consultas: consultas.length, ms }
  }

  async function ofertaCon(postulantes: number): Promise<number> {
    const offer = await prisma.offer.create({
      data: {
        companyId,
        title: `Oferta D-04 con ${postulantes} postulantes`,
        description: 'Fixture de integración para medir la lista de postulaciones.',
        modality: 'PRESENCIAL',
        seats: 1,
        requiredHours: 240,
        periodStart: new Date('2026-03-01'),
        periodEnd: new Date('2026-07-31'),
      },
    })
    offerIds.push(offer.id)

    const candidatos = await prisma.user.createManyAndReturn({
      data: Array.from({ length: postulantes }, (_, index) => ({
        email: `candidato-${index}-${stamp}-${offer.id}@integracion.test`,
        // El mismo hash para todos: nadie inicia sesión con estos usuarios y
        // hashear 200 veces tardaría más que la prueba entera.
        password: relleno,
        fullName: `Candidato ${index} de la oferta ${offer.id}`,
      })),
      select: { id: true },
    })
    userIds.push(...candidatos.map((candidato) => candidato.id))

    await prisma.application.createMany({
      data: candidatos.map((candidato) => ({
        offerId: offer.id,
        studentId: candidato.id,
        motivation: 'Fixture de integración para medir la lista de postulaciones.',
      })),
    })
    return offer.id
  }

  beforeAll(async () => {
    relleno = await bcrypt.hash('fixture-only', 1)
    const company = await prisma.company.create({
      data: {
        taxId: `LIST-${stamp}`,
        name: 'Empresa integración listado',
        sector: 'Software',
        contactEmail: `listado-${stamp}@integracion.test`,
      },
    })
    companyId = company.id

    const coordinator = await prisma.user.create({
      data: {
        email: `coord-listado-${stamp}@integracion.test`,
        password: relleno,
        fullName: 'Coordinación listado',
        role: Role.COORDINATOR,
      },
    })
    coordinatorId = coordinator.id
    userIds.push(coordinator.id)

    service = new ApplicationService(prisma as never, new OfferService(prisma as never))
    ofertaPocos = await ofertaCon(POSTULANTES_POCOS)
    ofertaMuchos = await ofertaCon(POSTULANTES_MUCHOS)

    // Primera llamada aparte: la conexión y los planes se preparan una vez y
    // esa demora no es la de la pantalla.
    await medirPantalla(ofertaPocos)
  }, 60_000)

  afterAll(async () => {
    await prisma.application.deleteMany({ where: { offerId: { in: offerIds } } })
    await prisma.offer.deleteMany({ where: { id: { in: offerIds } } })
    await prisma.user.deleteMany({ where: { id: { in: userIds } } })
    await prisma.company.delete({ where: { id: companyId } })
    await prisma.$disconnect()
  })

  it(`con ${POSTULANTES_MUCHOS} postulaciones hace las mismas consultas que con ${POSTULANTES_POCOS}`, async () => {
    const pocos = await medirPantalla(ofertaPocos)
    const muchos = await medirPantalla(ofertaMuchos)

    expect(pocos.filas).toHaveLength(POSTULANTES_POCOS)
    expect(muchos.filas).toHaveLength(POSTULANTES_MUCHOS)
    expect(muchos.consultas).toBe(pocos.consultas)
  })

  it(`devuelve las ${POSTULANTES_MUCHOS} postulaciones en menos de ${TOPE_MS} ms`, async () => {
    const { ms } = await medirPantalla(ofertaMuchos)

    expect(ms).toBeLessThan(TOPE_MS)
  })

  it('cada postulación trae a su candidato, y del candidato solo lo público', async () => {
    const { filas } = await medirPantalla(ofertaMuchos)

    for (const fila of filas) {
      expect(fila.student).toMatchObject({ id: fila.studentId })
      expect(Object.keys(fila.student)).toEqual(['id', 'fullName', 'email'])
    }
  })
})
