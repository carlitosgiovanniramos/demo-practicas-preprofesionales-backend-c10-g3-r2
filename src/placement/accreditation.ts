export interface AccreditationInput {
  placementId: number
  studentName: string
  requiredHours: number
  approvedHours: number
  pendingHours: number
  hasAgreement: boolean
  hasInsurance: boolean
  hasFinalReport: boolean
  tutorEvaluationScore: number | null
  companyEvaluationScore: number | null
  placementStatus: string
}

export type AccreditationLevel =
  | 'ACREDITADO'
  | 'ACREDITADO_CON_OBSERVACIONES'
  | 'PENDIENTE'
  | 'NO_ACREDITADO'

export interface AccreditationResult {
  placementId: number
  studentName: string
  level: AccreditationLevel
  reasons: string[]
  completionPercentage: number
}

// D-05: complejidad ciclomática 17, anidamiento de 6 niveles.
// ESLint la marca con `complexity` (umbral 10). No refactorizar.
export function calculateAccreditationStatus(input: AccreditationInput): AccreditationResult {
  const reasons: string[] = []
  let level: AccreditationLevel = 'PENDIENTE'
  const percentage = Math.round((input.approvedHours / input.requiredHours) * 100)

  if (input.placementStatus === 'ABANDONED') {
    level = 'NO_ACREDITADO'
    reasons.push('placement abandonado')
    if (input.pendingHours > 0) {
      reasons.push(`hay ${input.pendingHours} horas pendientes sin revisar`)
    }
  } else {
    if (input.placementStatus === 'SUSPENDED') {
      level = 'NO_ACREDITADO'
      reasons.push('placement suspendido')
      if (input.hasAgreement) {
        reasons.push('convenio vigente pese a la suspensión')
      }
    } else {
      if (input.approvedHours >= input.requiredHours) {
        if (input.hasAgreement) {
          if (input.hasInsurance) {
            if (input.hasFinalReport) {
              if (input.tutorEvaluationScore !== null) {
                if (input.tutorEvaluationScore >= 3) {
                  if (input.companyEvaluationScore !== null && input.companyEvaluationScore >= 3) {
                    level = 'ACREDITADO'
                  } else {
                    level = 'ACREDITADO_CON_OBSERVACIONES'
                    reasons.push('falta evaluación de la empresa o es baja')
                  }
                } else {
                  level = 'NO_ACREDITADO'
                  reasons.push('evaluación del tutor por debajo del mínimo')
                  if (input.hasFinalReport) {
                    reasons.push('informe final entregado pese a evaluación baja')
                  }
                }
              } else {
                level = 'PENDIENTE'
                reasons.push('falta evaluación del tutor')
              }
            } else {
              level = 'PENDIENTE'
              reasons.push('falta informe final')
            }
          } else {
            level = 'NO_ACREDITADO'
            reasons.push('falta seguro')
            if (input.pendingHours > 0) {
              reasons.push(`hay ${input.pendingHours} horas pendientes de aprobación`)
            }
          }
        } else {
          level = 'NO_ACREDITADO'
          reasons.push('falta convenio')
          if (input.hasInsurance) {
            reasons.push('seguro vigente pese a la falta de convenio')
          }
        }
      } else {
        level = 'PENDIENTE'
        reasons.push('horas insuficientes')
        if (input.pendingHours > 0) {
          reasons.push(`hay ${input.pendingHours} horas pendientes de aprobación`)
        }
      }
    }
  }

  return { placementId: input.placementId, studentName: input.studentName, level, reasons, completionPercentage: percentage }
}
