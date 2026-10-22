import { describe, expect, it } from 'vitest'
import { calculateAccreditationStatus } from './accreditation'

const base = {
  placementId: 1,
  studentName: 'Estudiante 0',
  requiredHours: 240,
  approvedHours: 240,
  pendingHours: 0,
  hasAgreement: true,
  hasInsurance: true,
  hasFinalReport: true,
  tutorEvaluationScore: 4.5,
  companyEvaluationScore: 4.2,
  placementStatus: 'COMPLETED',
}

describe('calculateAccreditationStatus', () => {
  it('accredits a placement with all hours, documents and evaluations', () => {
    const result = calculateAccreditationStatus(base)

    expect(result.level).toBe('ACREDITADO')
    expect(result.reasons).toHaveLength(0)
    expect(result.completionPercentage).toBe(100)
  })

  it('marks as PENDIENTE when hours are still missing', () => {
    const result = calculateAccreditationStatus({ ...base, approvedHours: 120, pendingHours: 40, placementStatus: 'ACTIVE' })

    expect(result.level).toBe('PENDIENTE')
    expect(result.reasons).toContain('horas insuficientes')
    expect(result.completionPercentage).toBe(50)
  })

  // Caracterización (D-05): una fila por rama del árbol de decisión, con el nivel y
  // las razones en su orden exacto. Protege la refactorización de la función.
  it.each([
    ['abandoned with pending hours', { placementStatus: 'ABANDONED', pendingHours: 5 }, 'NO_ACREDITADO', ['placement abandonado', 'hay 5 horas pendientes sin revisar']],
    ['abandoned without pending hours', { placementStatus: 'ABANDONED' }, 'NO_ACREDITADO', ['placement abandonado']],
    ['suspended with agreement', { placementStatus: 'SUSPENDED' }, 'NO_ACREDITADO', ['placement suspendido', 'convenio vigente pese a la suspensión']],
    ['suspended without agreement', { placementStatus: 'SUSPENDED', hasAgreement: false }, 'NO_ACREDITADO', ['placement suspendido']],
    ['insufficient hours with pending', { approvedHours: 200, pendingHours: 40 }, 'PENDIENTE', ['horas insuficientes', 'hay 40 horas pendientes de aprobación']],
    ['insufficient hours without pending', { approvedHours: 200 }, 'PENDIENTE', ['horas insuficientes']],
    ['no agreement with insurance', { hasAgreement: false }, 'NO_ACREDITADO', ['falta convenio', 'seguro vigente pese a la falta de convenio']],
    ['no agreement without insurance', { hasAgreement: false, hasInsurance: false }, 'NO_ACREDITADO', ['falta convenio']],
    ['no insurance with pending', { hasInsurance: false, pendingHours: 3 }, 'NO_ACREDITADO', ['falta seguro', 'hay 3 horas pendientes de aprobación']],
    ['no insurance without pending', { hasInsurance: false }, 'NO_ACREDITADO', ['falta seguro']],
    ['no final report', { hasFinalReport: false }, 'PENDIENTE', ['falta informe final']],
    ['no tutor evaluation', { tutorEvaluationScore: null }, 'PENDIENTE', ['falta evaluación del tutor']],
    ['tutor below minimum with final report', { tutorEvaluationScore: 2 }, 'NO_ACREDITADO', ['evaluación del tutor por debajo del mínimo', 'informe final entregado pese a evaluación baja']],
    ['tutor at minimum, no company evaluation', { companyEvaluationScore: null }, 'ACREDITADO_CON_OBSERVACIONES', ['falta evaluación de la empresa o es baja']],
    ['tutor at minimum, company below minimum', { tutorEvaluationScore: 3, companyEvaluationScore: 2.9 }, 'ACREDITADO_CON_OBSERVACIONES', ['falta evaluación de la empresa o es baja']],
    ['both evaluations at minimum', { tutorEvaluationScore: 3, companyEvaluationScore: 3 }, 'ACREDITADO', []],
  ])('characterizes %s', (_name, overrides, level, reasons) => {
    const result = calculateAccreditationStatus({ ...base, ...overrides })

    expect(result.level).toBe(level)
    expect(result.reasons).toEqual(reasons)
  })
})
