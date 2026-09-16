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
})
