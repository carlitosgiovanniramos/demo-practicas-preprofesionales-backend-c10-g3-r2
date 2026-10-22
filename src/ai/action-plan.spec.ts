import { ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { Role } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import type { AccreditationReport } from '../placement/accreditation.service'
import { buildActionPlanPrompt } from './action-plan'
import { ActionPlanService } from './action-plan.service'
import { AiUnavailableError } from './ai-provider'

const report = (placementId: number): AccreditationReport => ({
  placementId,
  studentName: 'Estudiante',
  level: 'PENDIENTE',
  reasons: ['falta informe final'],
  completionPercentage: 80,
  requiredHours: 240,
  approvedHours: 192,
  pendingHours: 12,
})

function build(opts: { plan?: unknown; reports?: AccreditationReport[]; generateText?: () => Promise<string> } = {}) {
  const findUnique = vi.fn(async () => opts.plan ?? null)
  const upsert = vi.fn(async (args: unknown) => args)
  const assertPlacementAccess = vi.fn(async () => undefined)
  const reportForPeriod = vi.fn(async () => opts.reports ?? [report(1)])
  const generateText = vi.fn(opts.generateText ?? (async () => 'Plan generado'))
  const service = new ActionPlanService(
    { actionPlan: { findUnique, upsert } } as never,
    { assertPlacementAccess } as never,
    { reportForPeriod } as never,
    { generateText } as never,
  )
  return { service, findUnique, upsert, assertPlacementAccess, reportForPeriod, generateText }
}

describe('buildActionPlanPrompt', () => {
  it('calcula las horas faltantes y pide responsables por acción', () => {
    const prompt = buildActionPlanPrompt(report(1))
    expect(prompt).toContain('"horasFaltantesParaCompletar":48')
    expect(prompt).toContain('(estudiante), (tutor) o (coordinación)')
    expect(prompt).toContain('No inventes motivos')
  })
})

describe('ActionPlanService', () => {
  it('get: verifica acceso y devuelve el plan guardado', async () => {
    const plan = { placementId: 1, content: '1. Entregar informe (estudiante)' }
    const f = build({ plan })
    await expect(f.service.get(1, 3, Role.STUDENT)).resolves.toEqual(plan)
    expect(f.assertPlacementAccess).toHaveBeenCalledWith(1, 3, Role.STUDENT)
  })

  it('get: devuelve un objeto sin contenido cuando aún no hay plan (nunca cuerpo vacío)', async () => {
    const f = build()
    await expect(f.service.get(1, 9, Role.COORDINATOR)).resolves.toEqual({
      placementId: 1,
      content: null,
      updatedAt: null,
    })
  })

  it('save: crea o reemplaza el plan con el contenido editado', async () => {
    const f = build()
    await f.service.save(1, 'Plan editado', 9, Role.COORDINATOR)
    expect(f.upsert).toHaveBeenCalledWith({
      where: { placementId: 1 },
      create: { placementId: 1, content: 'Plan editado' },
      update: { content: 'Plan editado' },
    })
  })

  it('save: no guarda si el usuario no tiene acceso', async () => {
    const f = build()
    f.assertPlacementAccess.mockRejectedValueOnce(new ForbiddenException('no tienes acceso a este placement'))
    await expect(f.service.save(1, 'x', 3, Role.STUDENT)).rejects.toThrow(ForbiddenException)
    expect(f.upsert).not.toHaveBeenCalled()
  })

  it('draft: devuelve el borrador sin guardarlo', async () => {
    const f = build()
    await expect(f.service.draft(1, '2026-1')).resolves.toEqual({ draft: 'Plan generado' })
    expect(f.upsert).not.toHaveBeenCalled()
  })

  it('draft: 404 si el placement no está en el periodo', async () => {
    const f = build({ reports: [report(2)] })
    await expect(f.service.draft(1, '2026-1')).rejects.toThrow(NotFoundException)
  })

  it('draft: 503 si la IA no está disponible', async () => {
    const f = build({
      generateText: async () => {
        throw new AiUnavailableError('la respuesta de Gemini quedó incompleta')
      },
    })
    await expect(f.service.draft(1, '2026-1')).rejects.toThrow(ServiceUnavailableException)
  })
})
