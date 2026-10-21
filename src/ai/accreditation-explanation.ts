import type { AccreditationReport } from '../placement/accreditation.service'

/**
 * Plantilla fija del explicador. El nivel y los motivos vienen de la regla determinista, y las
 * cifras se calculan aquí, no por el modelo. El modelo rellena la acción; no repite lo que ya se ve.
 */
export function buildAccreditationPrompt(report: AccreditationReport): string {
  const facts = {
    nivel: report.level,
    porcentajeAvance: report.completionPercentage,
    horasFaltantesParaCompletar: Math.max(0, report.requiredHours - report.approvedHours),
    horasPendientesDeRevision: report.pendingHours,
    motivos: report.reasons,
  }
  return [
    'Rol: asesor académico. Idioma: español. Máximo 3 frases.',
    'Plantilla: "Le faltan {horasFaltantesParaCompletar} h ({porcentajeAvance}% de avance). {acción concreta según los motivos}. {si horasPendientesDeRevision > 0: El tutor puede aprobar {horasPendientesDeRevision} h pendientes.}"',
    'Reglas: no repitas el nivel ni los motivos; no cambies el nivel; no hagas cálculos; si faltan 0 h, omite la primera frase.',
    `Datos: ${JSON.stringify(facts)}`,
  ].join('\n')
}
