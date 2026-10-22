import type { AccreditationReport } from '../placement/accreditation.service'

/**
 * Plantilla del borrador de plan de acción. Las cifras las calcula la regla; el modelo solo
 * redacta acciones, cada una atada a un motivo y con su responsable.
 */
export function buildActionPlanPrompt(report: AccreditationReport): string {
  const facts = {
    nivel: report.level,
    porcentajeAvance: report.completionPercentage,
    horasFaltantesParaCompletar: Math.max(0, report.requiredHours - report.approvedHours),
    horasPendientesDeRevision: report.pendingHours,
    motivos: report.reasons,
  }
  return [
    'Rol: asesor de prácticas preprofesionales. Idioma: español.',
    'Plantilla: lista numerada de 3 a 5 acciones, una frase cada una, con el responsable entre paréntesis: (estudiante), (tutor) o (coordinación).',
    'Reglas: cada acción resuelve un motivo de la lista. No inventes motivos ni cambies el nivel. No hagas cálculos: usa las cifras tal como vienen.',
    `Datos: ${JSON.stringify(facts)}`,
  ].join('\n')
}
