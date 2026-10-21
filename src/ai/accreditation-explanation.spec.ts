import { NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import type { AccreditationResult } from '../placement/accreditation'
import { AiUnavailableError, type AiTextProvider } from './ai-provider'
import { buildAccreditationPrompt } from './accreditation-explanation'
import { AccreditationExplanationService } from './accreditation-explanation.service'

const result = (placementId: number, level: AccreditationResult['level'] = 'PENDIENTE'): AccreditationResult => ({
  placementId,
  studentName: `Estudiante ${placementId}`,
  level,
  reasons: ['falta informe final'],
  completionPercentage: 80,
})

function build(results: AccreditationResult[], generateText = vi.fn(async () => 'Explicación')) {
  const reportForPeriod = vi.fn(async () => results)
  const service = new AccreditationExplanationService(
    { reportForPeriod } as never,
    { generateText } as AiTextProvider as never,
  )
  return { service, reportForPeriod, generateText }
}

describe('buildAccreditationPrompt', () => {
  it('pasa el nivel y los motivos tal cual y prohíbe cambiarlos', () => {
    const prompt = buildAccreditationPrompt(result(1, 'NO_ACREDITADO'))
    expect(prompt).toContain('"nivel":"NO_ACREDITADO"')
    expect(prompt).toContain('falta informe final')
    expect(prompt).toContain('no los cambies')
  })
})

describe('AccreditationExplanationService.explainPlacement', () => {
  it('explica el placement pedido con su nivel y motivos de la regla', async () => {
    const { service, reportForPeriod } = build([result(1), result(2, 'ACREDITADO')])
    const out = await service.explainPlacement(2, '2026-1')
    expect(reportForPeriod).toHaveBeenCalledWith('2026-1')
    expect(out).toEqual({
      placementId: 2,
      period: '2026-1',
      level: 'ACREDITADO',
      reasons: ['falta informe final'],
      explanation: 'Explicación',
    })
  })

  it('responde 404 si el placement no está en el periodo', async () => {
    const { service } = build([result(1)])
    await expect(service.explainPlacement(9, '2026-1')).rejects.toThrow(NotFoundException)
  })

  it('responde 503 si Gemini no está disponible', async () => {
    const generateText = vi.fn(async () => {
      throw new AiUnavailableError('Gemini respondió 429')
    })
    const { service } = build([result(1)], generateText)
    await expect(service.explainPlacement(1, '2026-1')).rejects.toThrow(ServiceUnavailableException)
  })
})
