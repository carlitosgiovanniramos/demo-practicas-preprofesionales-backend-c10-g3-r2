import type { AccreditationReport } from '../placement/accreditation.service'

/**
 * Prompt del explicador. El nivel y los motivos vienen de la regla determinista. El modelo no los
 * repite (ya se ven en la fila): los interpreta y dice qué acción los resuelve, con las cifras
 * calculadas aquí, no por el modelo.
 */
export function buildAccreditationPrompt(report: AccreditationReport): string {
  const facts = {
    nivel: report.level,
    motivos: report.reasons,
    porcentajeAvance: report.completionPercentage,
    horasRequeridas: report.requiredHours,
    horasAprobadas: report.approvedHours,
    horasFaltantesParaCompletar: Math.max(0, report.requiredHours - report.approvedHours),
    horasPendientesDeRevision: report.pendingHours,
  }
  return [
    'Escribe en español, para un coordinador académico, una explicación de 2 o 3 frases sobre qué le falta a este estudiante para acreditar y qué acción lo resuelve.',
    'No repitas el nivel ni copies la lista de motivos: interprétalos y di qué hacer con ellos.',
    'Incluye el porcentaje de avance y las horas faltantes tal como aparecen en los datos. No hagas cálculos nuevos.',
    'Si hay horas pendientes de revisión, indica que el tutor puede aprobarlas. No cambies el nivel ni prometas la acreditación. Máximo 60 palabras.',
    '',
    'Datos (JSON):',
    JSON.stringify(facts),
  ].join('\n')
}
