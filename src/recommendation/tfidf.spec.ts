import { describe, expect, it } from 'vitest'
import { buildIdf, cosine, meanVector, topSharedTerms, vectorize } from './tfidf'

const docs = [
  ['react', 'web', 'frontend'],
  ['react', 'native', 'movil'],
  ['contabilidad', 'impuestos'],
]

describe('buildIdf', () => {
  it('da más peso a los términos raros que a los comunes', () => {
    const idf = buildIdf(docs)
    expect(idf.get('contabilidad')!).toBeGreaterThan(idf.get('react')!)
  })
})

describe('vectorize', () => {
  it('produce un vector normalizado (norma 1) y solo con términos conocidos', () => {
    const idf = buildIdf(docs)
    const v = vectorize(['react', 'web', 'desconocido'], idf)
    expect(v.has('desconocido')).toBe(false)
    const norm = Math.sqrt([...v.values()].reduce((s, x) => s + x * x, 0))
    expect(norm).toBeCloseTo(1, 10)
  })

  it('devuelve un vector vacío si no hay términos conocidos', () => {
    expect(vectorize(['nada'], buildIdf(docs)).size).toBe(0)
  })
})

describe('cosine', () => {
  it('vale 1 para vectores iguales y 0 para vectores sin términos en común', () => {
    const idf = buildIdf(docs)
    const a = vectorize(['react', 'web'], idf)
    expect(cosine(a, a)).toBeCloseTo(1, 10)
    expect(cosine(a, vectorize(['contabilidad'], idf))).toBe(0)
  })

  it('vale 0 si uno de los vectores está vacío', () => {
    expect(cosine(new Map(), vectorize(['react'], buildIdf(docs)))).toBe(0)
  })
})

describe('meanVector', () => {
  it('promedia y renormaliza los vectores del perfil', () => {
    const idf = buildIdf(docs)
    const profile = meanVector([vectorize(['react', 'web'], idf), vectorize(['react', 'native'], idf)])
    const norm = Math.sqrt([...profile.values()].reduce((s, x) => s + x * x, 0))
    expect(norm).toBeCloseTo(1, 10)
    expect(profile.get('react')!).toBeGreaterThan(profile.get('web')!)
  })
})

describe('topSharedTerms', () => {
  it('devuelve los términos compartidos que más aportan, con los raros primero', () => {
    const idf = buildIdf(docs)
    const profile = vectorize(['react', 'web', 'frontend'], idf)
    const candidate = vectorize(['react', 'web', 'native'], idf)
    // "web" aparece en una sola oferta, así que pesa más que "react", que aparece en dos.
    expect(topSharedTerms(profile, candidate, 2)).toEqual(['web', 'react'])
    expect(topSharedTerms(profile, candidate, 3)).toHaveLength(2)
  })
})
