import { BadRequestException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common'
import { Role } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { AiUnavailableError, type AiTextProvider } from './ai-provider'
import { buildWeeklySummaryPrompt, weekRange } from './weekly-summary'
import { WeeklySummaryService } from './weekly-summary.service'

describe('weekRange', () => {
  it('devuelve el rango [lunes, lunes+7) en UTC', () => {
    const range = weekRange('2026-04-06')
    expect(range?.from.toISOString()).toBe('2026-04-06T00:00:00.000Z')
    expect(range?.to.toISOString()).toBe('2026-04-13T00:00:00.000Z')
  })

  it('rechaza fechas que no existen', () => {
    expect(weekRange('2026-02-31')).toBeNull()
  })
})

describe('buildWeeklySummaryPrompt', () => {
  it('incluye solo los datos recibidos, como JSON, con la regla de no inventar', () => {
    const prompt = buildWeeklySummaryPrompt([
      { date: new Date('2026-04-06T00:00:00.000Z'), startTime: '08:00', endTime: '12:00', hours: 4, activity: 'Soporte' },
    ])
    expect(prompt).toContain('No inventes actividades')
    expect(prompt).toContain('"actividad":"Soporte"')
    expect(prompt).toContain('"fecha":"2026-04-06"')
  })
})

interface Fixture {
  findMany: ReturnType<typeof vi.fn>
  assertPlacementAccess: ReturnType<typeof vi.fn>
  generateText: ReturnType<typeof vi.fn>
  service: WeeklySummaryService
}

function build(rows: { date: Date; startTime: string; endTime: string; hours: number; activity: string }[]): Fixture {
  const findMany = vi.fn(async () => rows)
  const assertPlacementAccess = vi.fn(async () => undefined)
  const generateText = vi.fn(async () => 'Borrador de la semana')
  const service = new WeeklySummaryService(
    { hourLog: { findMany } } as never,
    { assertPlacementAccess } as never,
    { generateText } as AiTextProvider as never,
  )
  return { findMany, assertPlacementAccess, generateText, service }
}

const monday = new Date('2026-04-06T00:00:00.000Z')
const tuesday = new Date('2026-04-07T00:00:00.000Z')

describe('WeeklySummaryService.draft', () => {
  it('consulta el rango de la semana, suma horas y genera el borrador', async () => {
    const f = build([
      { date: monday, startTime: '08:00', endTime: '12:00', hours: 4, activity: 'Soporte' },
      { date: tuesday, startTime: '08:00', endTime: '10:30', hours: 2.5, activity: 'Inventario' },
    ])

    const result = await f.service.draft(7, '2026-04-06', 3, Role.STUDENT)

    expect(f.assertPlacementAccess).toHaveBeenCalledWith(7, 3, Role.STUDENT)
    const where = (f.findMany.mock.calls[0] as unknown as [{ where: { date: { gte: Date; lt: Date } } }])[0].where
    expect(where.date.gte.toISOString()).toBe('2026-04-06T00:00:00.000Z')
    expect(where.date.lt.toISOString()).toBe('2026-04-13T00:00:00.000Z')
    expect(result).toEqual({
      placementId: 7,
      weekStart: '2026-04-06',
      totalHours: 6.5,
      entries: 2,
      draft: 'Borrador de la semana',
    })
  })

  it('no llama a Gemini si la semana no tiene jornadas', async () => {
    const f = build([])
    const result = await f.service.draft(7, '2026-04-06', 3, Role.STUDENT)
    expect(result).toEqual({ placementId: 7, weekStart: '2026-04-06', totalHours: 0, entries: 0, draft: null })
    expect(f.generateText).not.toHaveBeenCalled()
  })

  it('responde 503 si el proveedor de IA no está disponible', async () => {
    const f = build([{ date: monday, startTime: '08:00', endTime: '12:00', hours: 4, activity: 'Soporte' }])
    f.generateText.mockRejectedValueOnce(new AiUnavailableError('GEMINI_API_KEY no está configurada'))
    await expect(f.service.draft(7, '2026-04-06', 3, Role.STUDENT)).rejects.toThrow(ServiceUnavailableException)
  })

  it('rechaza una semana inexistente sin consultar nada', async () => {
    const f = build([])
    await expect(f.service.draft(7, '2026-02-31', 3, Role.STUDENT)).rejects.toThrow(BadRequestException)
    expect(f.findMany).not.toHaveBeenCalled()
  })

  it('propaga el rechazo de acceso del placement', async () => {
    const f = build([])
    f.assertPlacementAccess.mockRejectedValueOnce(new ForbiddenException('no tienes acceso a este placement'))
    await expect(f.service.draft(7, '2026-04-06', 99, Role.STUDENT)).rejects.toThrow(ForbiddenException)
    expect(f.findMany).not.toHaveBeenCalled()
  })
})
