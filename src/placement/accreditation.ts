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

interface Verdict {
  level: AccreditationLevel
  reasons: string[]
}

const MIN_EVALUATION_SCORE = 3

// Un NaN cuenta como nota insuficiente, igual que en la versión anterior de la regla.
function isBelowMinimum(score: number): boolean {
  return Number.isNaN(score) || score < MIN_EVALUATION_SCORE
}

/**
 * Cada regla devuelve su veredicto, o `null` cuando no decide y pasa a la siguiente.
 * El orden de `calculateAccreditationStatus` es el de la norma: estado del placement,
 * horas, documentos y, por último, evaluaciones (D-05).
 */
export function calculateAccreditationStatus(input: AccreditationInput): AccreditationResult {
  const verdict =
    placementStatusVerdict(input) ??
    hoursVerdict(input) ??
    documentsVerdict(input) ??
    evaluationVerdict(input)

  return {
    placementId: input.placementId,
    studentName: input.studentName,
    level: verdict.level,
    reasons: verdict.reasons,
    completionPercentage: Math.round((input.approvedHours / input.requiredHours) * 100),
  }
}

function pendingReason(pendingHours: number, suffix: string): string[] {
  return pendingHours > 0 ? [`hay ${pendingHours} horas pendientes ${suffix}`] : []
}

function placementStatusVerdict(input: AccreditationInput): Verdict | null {
  if (input.placementStatus === 'ABANDONED') {
    return {
      level: 'NO_ACREDITADO',
      reasons: ['placement abandonado', ...pendingReason(input.pendingHours, 'sin revisar')],
    }
  }
  if (input.placementStatus === 'SUSPENDED') {
    return {
      level: 'NO_ACREDITADO',
      reasons: ['placement suspendido', ...(input.hasAgreement ? ['convenio vigente pese a la suspensión'] : [])],
    }
  }
  return null
}

function hoursVerdict(input: AccreditationInput): Verdict | null {
  if (input.approvedHours >= input.requiredHours) return null
  return {
    level: 'PENDIENTE',
    reasons: ['horas insuficientes', ...pendingReason(input.pendingHours, 'de aprobación')],
  }
}

function documentsVerdict(input: AccreditationInput): Verdict | null {
  if (!input.hasAgreement) {
    return {
      level: 'NO_ACREDITADO',
      reasons: ['falta convenio', ...(input.hasInsurance ? ['seguro vigente pese a la falta de convenio'] : [])],
    }
  }
  if (!input.hasInsurance) {
    return {
      level: 'NO_ACREDITADO',
      reasons: ['falta seguro', ...pendingReason(input.pendingHours, 'de aprobación')],
    }
  }
  if (!input.hasFinalReport) {
    return { level: 'PENDIENTE', reasons: ['falta informe final'] }
  }
  return null
}

function evaluationVerdict(input: AccreditationInput): Verdict {
  const tutorScore = input.tutorEvaluationScore
  if (tutorScore === null) {
    return { level: 'PENDIENTE', reasons: ['falta evaluación del tutor'] }
  }
  if (isBelowMinimum(tutorScore)) {
    // Solo llegamos aquí con informe final: documentsVerdict corta antes si falta.
    return {
      level: 'NO_ACREDITADO',
      reasons: ['evaluación del tutor por debajo del mínimo', 'informe final entregado pese a evaluación baja'],
    }
  }
  const companyScore = input.companyEvaluationScore
  if (companyScore === null || isBelowMinimum(companyScore)) {
    return { level: 'ACREDITADO_CON_OBSERVACIONES', reasons: ['falta evaluación de la empresa o es baja'] }
  }
  return { level: 'ACREDITADO', reasons: [] }
}
