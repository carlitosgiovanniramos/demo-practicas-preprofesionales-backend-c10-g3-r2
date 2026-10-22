/** Vector disperso término -> peso. Los vectores que se comparan van normalizados (norma 1). */
export type TermVector = Map<string, number>

/**
 * IDF suavizado: ln((N + 1) / (df + 1)) + 1. Así un término presente en todos los documentos
 * sigue pesando algo, y nunca aparece un peso negativo.
 */
export function buildIdf(documents: string[][]): Map<string, number> {
  const documentFrequency = new Map<string, number>()
  for (const terms of documents) {
    for (const term of new Set(terms)) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1)
    }
  }
  const total = documents.length
  const idf = new Map<string, number>()
  for (const [term, df] of documentFrequency) {
    idf.set(term, Math.log((total + 1) / (df + 1)) + 1)
  }
  return idf
}

function normalize(vector: TermVector): TermVector {
  let sumSquares = 0
  for (const weight of vector.values()) sumSquares += weight * weight
  const norm = Math.sqrt(sumSquares)
  if (norm === 0) return new Map()
  const result: TermVector = new Map()
  for (const [term, weight] of vector) result.set(term, weight / norm)
  return result
}

/** TF (frecuencia relativa) x IDF, normalizado. Ignora términos que no están en el IDF. */
export function vectorize(terms: string[], idf: Map<string, number>): TermVector {
  if (terms.length === 0) return new Map()
  const counts = new Map<string, number>()
  for (const term of terms) {
    if (idf.has(term)) counts.set(term, (counts.get(term) ?? 0) + 1)
  }
  const weighted: TermVector = new Map()
  for (const [term, count] of counts) {
    weighted.set(term, (count / terms.length) * (idf.get(term) as number))
  }
  return normalize(weighted)
}

/** Perfil: promedio de vectores normalizados, renormalizado. */
export function meanVector(vectors: TermVector[]): TermVector {
  const sum: TermVector = new Map()
  for (const vector of vectors) {
    for (const [term, weight] of vector) sum.set(term, (sum.get(term) ?? 0) + weight)
  }
  return normalize(sum)
}

/** Similitud coseno. Con vectores normalizados es el producto punto. */
export function cosine(a: TermVector, b: TermVector): number {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a]
  let dot = 0
  for (const [term, weight] of small) {
    const other = large.get(term)
    if (other !== undefined) dot += weight * other
  }
  return dot
}

/** Términos compartidos ordenados por la contribución al coseno (peso en a x peso en b). */
export function topSharedTerms(a: TermVector, b: TermVector, limit: number): string[] {
  const contributions: [string, number][] = []
  for (const [term, weight] of a) {
    const other = b.get(term)
    if (other !== undefined) contributions.push([term, weight * other])
  }
  return contributions
    .sort((x, y) => y[1] - x[1])
    .slice(0, limit)
    .map(([term]) => term)
}
