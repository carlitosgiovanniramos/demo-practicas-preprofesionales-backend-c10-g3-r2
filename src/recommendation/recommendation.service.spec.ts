import { ServiceUnavailableException } from '@nestjs/common'
import { OfferStatus } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { AiUnavailableError } from '../ai/ai-provider'
import { RecommendationService } from './recommendation.service'

interface OfferRow {
  id: number
  title: string
  description: string
  modality: string
  status: OfferStatus
  publishedAt: Date | null
}

const offers: OfferRow[] = [
  {
    id: 1,
    title: 'Desarrollador React frontend',
    description: 'Interfaces web con React y componentes reutilizables',
    modality: 'remoto',
    status: OfferStatus.PUBLISHED,
    publishedAt: new Date('2026-03-01T00:00:00.000Z'),
  },
  {
    id: 2,
    title: 'Desarrollador React Native',
    description: 'Aplicaciones moviles con React Native para tiendas',
    modality: 'presencial',
    status: OfferStatus.PUBLISHED,
    publishedAt: new Date('2026-03-05T00:00:00.000Z'),
  },
  {
    id: 3,
    title: 'Auxiliar contable',
    description: 'Registro de impuestos y conciliaciones bancarias',
    modality: 'presencial',
    status: OfferStatus.PUBLISHED,
    publishedAt: new Date('2026-03-10T00:00:00.000Z'),
  },
  {
    id: 4,
    title: 'Soporte de redes',
    description: 'Administracion de redes y servidores',
    modality: 'presencial',
    status: OfferStatus.CLOSED,
    publishedAt: new Date('2026-02-01T00:00:00.000Z'),
  },
]

function build(applied: number[], rows: OfferRow[] = offers) {
  const applicationFindMany = vi.fn(async () => applied.map((offerId) => ({ offerId })))
  const offerFindMany = vi.fn(async () => rows)
  const generateText = vi.fn(async () => '[{"id":2,"razon":"Comparte React con tu experiencia."}]')
  const service = new RecommendationService(
    {
      application: { findMany: applicationFindMany },
      offer: { findMany: offerFindMany },
    } as never,
    { generateText } as never,
    { assertOfferOwnership: vi.fn() } as never,
  )
  return { service, applicationFindMany, offerFindMany, generateText }
}

describe('RecommendationService.forStudent', () => {
  it('sin postulaciones devuelve las ofertas publicadas más recientes con score 0', async () => {
    const { service } = build([])
    const result = await service.forStudent(9, 2)
    expect(result.map((r) => r.id)).toEqual([3, 2])
    expect(result.every((r) => r.score === 0 && r.matchedTerms.length === 0)).toBe(true)
  })

  it('ordena por similitud con lo que el estudiante ya postuló, aunque sea otra categoría cercana', async () => {
    const { service } = build([1])
    const result = await service.forStudent(9, 10)
    expect(result[0].id).toBe(2)
    expect(result[0].score).toBeGreaterThan(0)
    expect(result[0].matchedTerms).toContain('react')
    expect(result.at(-1)!.id).toBe(3)
    expect(result.at(-1)!.score).toBe(0)
  })

  it('no recomienda ofertas a las que el estudiante ya postuló ni las que no están publicadas', async () => {
    const { service } = build([1])
    const ids = (await service.forStudent(9, 10)).map((r) => r.id)
    expect(ids).not.toContain(1)
    expect(ids).not.toContain(4)
  })

  it('respeta el límite pedido', async () => {
    const { service } = build([1])
    expect(await service.forStudent(9, 1)).toHaveLength(1)
  })

  it('pide al repositorio solo las postulaciones del estudiante y las ofertas publicadas o postuladas', async () => {
    const { service, applicationFindMany, offerFindMany } = build([1])
    await service.forStudent(9, 5)
    expect(applicationFindMany).toHaveBeenCalledWith({ where: { studentId: 9 }, select: { offerId: true } })
    expect(offerFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.any(Object) }))
  })

  it('redondea el score a 3 decimales', async () => {
    const { service } = build([1])
    const [first] = await service.forStudent(9, 1)
    expect(Math.round(first.score * 1000) / 1000).toBe(first.score)
  })

  it('sin explain no llama al modelo y deja la explicación en null', async () => {
    const { service, generateText } = build([1])
    const result = await service.forStudent(9, 5)
    expect(generateText).not.toHaveBeenCalled()
    expect(result.every((r) => r.explanation === null)).toBe(true)
  })

  it('con explain llama al modelo una vez y explica solo las cinco primeras', async () => {
    const { service, generateText } = build([1])
    const result = await service.forStudent(9, 10, true)
    expect(generateText).toHaveBeenCalledTimes(1)
    expect(result[0].explanation).toBe('Comparte React con tu experiencia.')
    expect(result[1].explanation).toBeNull()
  })

  it('con explain y sin candidatas no llama al modelo', async () => {
    const { service, generateText } = build([1, 2, 3], offers)
    expect(await service.forStudent(9, 5, true)).toEqual([])
    expect(generateText).not.toHaveBeenCalled()
  })

  it('si el modelo no responde, lanza ServiceUnavailableException', async () => {
    const { service, generateText } = build([1])
    generateText.mockRejectedValueOnce(new AiUnavailableError('MiniMax respondió 429', 429))
    await expect(service.forStudent(9, 5, true)).rejects.toBeInstanceOf(ServiceUnavailableException)
  })
})

// Oferta idéntica a la 1: un postulante que solo tiene esta debe tener afinidad 1 con la 1.
const twinOfOffer1: OfferRow = {
  id: 5,
  title: 'Desarrollador React frontend',
  description: 'Interfaces web con React y componentes reutilizables',
  modality: 'remoto',
  status: OfferStatus.PUBLISHED,
  publishedAt: new Date('2026-03-12T00:00:00.000Z'),
}

interface ApplicantHistory {
  studentId: number
  offerIds: number[]
}

function buildInsights(measuredOfferId: number, applicants: ApplicantHistory[], rows: OfferRow[] = [...offers, twinOfOffer1]) {
  const applicationFindMany = vi.fn(async (args: { where: Record<string, unknown> }) => {
    if ('offerId' in args.where) {
      return applicants.filter((a) => a.offerIds.includes(measuredOfferId)).map((a) => ({ studentId: a.studentId }))
    }
    return applicants.flatMap((a) => a.offerIds.map((offerId) => ({ studentId: a.studentId, offerId })))
  })
  const assertOfferOwnership = vi.fn(async () => ({ id: measuredOfferId }))
  const service = new RecommendationService(
    { application: { findMany: applicationFindMany }, offer: { findMany: vi.fn(async () => rows) } } as never,
    { generateText: vi.fn() } as never,
    { assertOfferOwnership } as never,
  )
  return { service, applicationFindMany, assertOfferOwnership }
}

describe('RecommendationService.offerInsights', () => {
  it('verifica que la empresa sea dueña de la oferta antes de leer postulantes', async () => {
    const { service, applicationFindMany, assertOfferOwnership } = buildInsights(1, [])
    await service.offerInsights(1, 77, 'COMPANY')
    expect(assertOfferOwnership).toHaveBeenCalledWith(1, 77, 'COMPANY')
    expect(applicationFindMany).toHaveBeenCalled()
  })

  it('no lee postulantes si la verificación de dueño falla', async () => {
    const applicationFindMany = vi.fn()
    const service = new RecommendationService(
      { application: { findMany: applicationFindMany }, offer: { findMany: vi.fn() } } as never,
      { generateText: vi.fn() } as never,
      { assertOfferOwnership: vi.fn(async () => Promise.reject(new Error('ajena'))) } as never,
    )
    await expect(service.offerInsights(1, 77, 'COMPANY')).rejects.toThrow('ajena')
    expect(applicationFindMany).not.toHaveBeenCalled()
  })

  it('cuenta postulantes y los que tienen historial además de esta oferta', async () => {
    const { service } = buildInsights(1, [
      { studentId: 5, offerIds: [1, 2] },
      { studentId: 6, offerIds: [1] },
    ])
    const result = await service.offerInsights(1, 77, 'COMPANY')
    expect(result.applicantCount).toBe(2)
    expect(result.withHistoryCount).toBe(1)
  })

  it('sin postulantes con historial la afinidad es null y no hay términos', async () => {
    const { service } = buildInsights(1, [{ studentId: 6, offerIds: [1] }])
    const result = await service.offerInsights(1, 77, 'COMPANY')
    expect(result.averageFit).toBeNull()
    expect(result.strongFitCount).toBe(0)
    expect(result.topTerms).toEqual([])
  })

  it('promedia la afinidad de los postulantes con historial y cuenta los de afinidad alta', async () => {
    const { service } = buildInsights(1, [
      { studentId: 5, offerIds: [3, 1] },
      { studentId: 8, offerIds: [5, 1] },
    ])
    const result = await service.offerInsights(1, 77, 'COMPANY')
    expect(result.withHistoryCount).toBe(2)
    expect(result.averageFit).toBe(0.5)
    expect(result.strongFitCount).toBe(1)
  })

  it('sugiere términos compartidos entre la oferta y el perfil de los postulantes', async () => {
    const { service } = buildInsights(1, [
      { studentId: 5, offerIds: [3, 1] },
      { studentId: 8, offerIds: [5, 1] },
    ])
    const result = await service.offerInsights(1, 77, 'COMPANY')
    expect(result.topTerms).toContain('react')
    expect(result.topTerms.length).toBeLessThanOrEqual(5)
  })
})
