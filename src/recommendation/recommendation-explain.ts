import { AiUnavailableError } from '../ai/ai-provider'

/** Tope de explicaciones por petición: acota el costo de MiniMax a una llamada de cinco ofertas. */
export const MAX_EXPLAINED = 5

export interface ExplainCandidate {
  id: number
  title: string
  matchedTerms: string[]
}

/**
 * El modelo solo narra el ranking que ya calculó la matemática. Responde un arreglo JSON corto y
 * no puede cambiar el orden ni inventar ofertas: los ids válidos son los que se le pasan.
 */
export function buildExplainPrompt(appliedTitles: string[], candidates: ExplainCandidate[]): string {
  return [
    'Rol: orientador de prácticas. Idioma: español. Para cada oferta candidata escribe una razón breve (máximo 20 palabras) basada en las postulaciones previas y en los términos compartidos.',
    'Reglas: No cambies el orden, no inventes ofertas ni datos, usa solo los ids recibidos.',
    'Salida: solo un arreglo JSON con la forma [{"id":<número>,"razon":"<texto>"}].',
    `Postulaciones previas: ${JSON.stringify(appliedTitles)}`,
    `Candidatas: ${JSON.stringify(candidates)}`,
  ].join('\n')
}

/**
 * Extrae el arreglo JSON de la respuesta (aunque venga con texto o cercas de código alrededor).
 * Descarta ids que no estaban entre las candidatas. Si no queda ninguna explicación válida, falla.
 */
export function parseExplanations(raw: string, allowedIds: number[]): Map<number, string> {
  const items = extractJsonArray(raw)
  const allowed = new Set(allowedIds)
  const explanations = new Map<number, string>()
  for (const item of items) {
    const entry = validEntry(item, allowed)
    if (entry) explanations.set(entry.id, entry.razon)
  }
  if (explanations.size === 0) throw new AiUnavailableError('la respuesta de IA no contiene explicaciones válidas')
  return explanations
}

function extractJsonArray(raw: string): unknown[] {
  const start = raw.indexOf('[')
  const end = raw.lastIndexOf(']')
  if (start < 0 || end < start) throw new AiUnavailableError('la respuesta de IA no trae un arreglo JSON')
  let parsed: unknown
  try {
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch {
    throw new AiUnavailableError('la respuesta de IA no es JSON válido')
  }
  if (!Array.isArray(parsed)) throw new AiUnavailableError('la respuesta de IA no es un arreglo')
  return parsed
}

function validEntry(item: unknown, allowed: Set<number>): { id: number; razon: string } | null {
  if (!item || typeof item !== 'object') return null
  const { id, razon } = item as { id?: unknown; razon?: unknown }
  if (typeof id !== 'number' || !allowed.has(id)) return null
  if (typeof razon !== 'string' || !razon.trim()) return null
  return { id, razon: razon.trim() }
}
