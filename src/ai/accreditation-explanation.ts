import type { AccreditationResult } from '../placement/accreditation'

/**
 * Prompt del explicador. El nivel y los motivos ya vienen decididos por la regla determinista;
 * el modelo solo los explica y tiene prohibido cambiarlos.
 */
export function buildAccreditationPrompt(result: AccreditationResult): string {
  const facts = {
    nivel: result.level,
    motivos: result.reasons,
    porcentajeHoras: result.completionPercentage,
  }
  return [
    'Explica en español, para un coordinador académico, por qué un estudiante tiene este estado de acreditación.',
    'El nivel y los motivos son definitivos: no los cambies, no agregues motivos y no des consejos legales.',
    'Máximo 80 palabras, en tercera persona, en un solo párrafo.',
    '',
    'Datos (JSON):',
    JSON.stringify(facts),
  ].join('\n')
}
