import { describe, expect, it } from 'vitest'
import { documentTerms, normalizeText, stem } from './text-normalize'

describe('normalizeText', () => {
  it('pasa a minúsculas, quita tildes y separa por palabras', () => {
    expect(normalizeText('Desarrollo WEB, Diseño gráfico')).toEqual(['desarrollo', 'web', 'diseno', 'grafico'])
  })

  it('elimina stopwords del español y tokens de menos de 3 caracteres', () => {
    expect(normalizeText('el apoyo de la red en un proyecto')).toEqual(['apoyo', 'red', 'proyecto'])
  })

  it('descarta signos de puntuación', () => {
    expect(normalizeText('Soporte (técnico) / redes')).toEqual(['soporte', 'tecnico', 'redes'])
  })
})

describe('stem', () => {
  it('quita sufijos comunes conservando una raíz de al menos 4 letras', () => {
    expect(stem('desarrolladores')).toBe('desarrollador')
    expect(stem('programacion')).toBe('program')
    expect(stem('web')).toBe('web')
  })

  it('no reduce las palabras si la raíz quedaría demasiado corta', () => {
    expect(stem('datos')).toBe('dato')
    expect(stem('redes')).toBe('redes')
  })
})

describe('documentTerms', () => {
  it('cuenta el título dos veces para que pese más que la descripción', () => {
    const terms = documentTerms({ title: 'Analista', description: 'reportes mensuales' })
    expect(terms.filter((t) => t === 'analista')).toHaveLength(2)
    expect(terms).toContain('report')
  })

  it('no usa la modalidad como texto: "remoto" uniría ofertas sin relación', () => {
    const terms = documentTerms({ title: 'Analista', description: 'reportes', modality: 'remoto' } as never)
    expect(terms).not.toContain('remot')
    expect(terms).not.toContain('remoto')
  })
})
