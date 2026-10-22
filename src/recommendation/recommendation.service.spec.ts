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
