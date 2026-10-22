/**
 * Normalización del texto de las ofertas antes de TF-IDF. Reduce el ruido del vocabulario:
 * sin tildes, sin palabras vacías del español, sin tokens cortos y con una raíz aproximada
 * para que "desarrollador" y "desarrolladores" cuenten como el mismo término.
 */

const STOPWORDS = new Set([
  'a', 'al', 'algo', 'como', 'con', 'de', 'del', 'el', 'ella', 'ellos', 'en', 'es', 'esta', 'este', 'esto',
  'la', 'las', 'le', 'les', 'lo', 'los', 'mas', 'me', 'mi', 'muy', 'no', 'o', 'para', 'pero', 'por', 'que',
  'se', 'si', 'sin', 'sobre', 'son', 'su', 'sus', 'te', 'tu', 'un', 'una', 'uno', 'unos', 'unas', 'y', 'ya',
  'the', 'and', 'for', 'with', 'of', 'to', 'in', 'on', 'is', 'are',
])

// Sufijos de más largo a más corto. Solo decide el primero que coincide: si su raíz quedaría
// demasiado corta, la palabra no cambia (no se prueba un sufijo más corto).
const SUFFIXES = [
  'amientos', 'imientos', 'aciones', 'iciones', 'idades', 'amente', 'mente', 'acion', 'icion', 'idad',
  'ables', 'ibles', 'able', 'ible', 'ando', 'endo', 'ados', 'adas', 'ado', 'ada', 'es', 's',
]
const MIN_ROOT_LENGTH = 4

export function stem(token: string): string {
  const suffix = SUFFIXES.find((candidate) => token.endsWith(candidate))
  if (suffix === undefined || token.length - suffix.length < MIN_ROOT_LENGTH) return token
  return token.slice(0, token.length - suffix.length)
}

/** Tokens normalizados de un texto libre. */
export function normalizeText(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token))
    .map(stem)
}

/**
 * Términos de una oferta. El título cuenta dos veces: suele resumir el área mejor que la descripción.
 * La modalidad (remoto, presencial) no entra: es logística, no contenido, y uniría ofertas sin relación.
 */
export function documentTerms(offer: { title: string; description: string }): string[] {
  return [...normalizeText(offer.title), ...normalizeText(offer.title), ...normalizeText(offer.description)]
}
