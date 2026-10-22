import { describe, expect, it } from 'vitest'
import { AiUnavailableError } from '../ai/ai-provider'
import { MAX_EXPLAINED, buildExplainPrompt, parseExplanations } from './recommendation-explain'

const candidates = [
  { id: 2, title: 'Desarrollador React Native', matchedTerms: ['react'] },
  { id: 5, title: 'Analista de datos', matchedTerms: ['dato'] },
]

describe('buildExplainPrompt', () => {
  it('incluye las postulaciones, las candidatas y la regla de no cambiar el orden', () => {
    const prompt = buildExplainPrompt(['Desarrollador React frontend'], candidates)
    expect(prompt).toContain('No cambies el orden')
    expect(prompt).toContain('"Desarrollador React frontend"')
    expect(prompt).toContain('"id":2')
    expect(prompt).toContain('"matchedTerms":["react"]')
  })

  it('limita las explicaciones a cinco ofertas', () => {
    expect(MAX_EXPLAINED).toBe(5)
  })
})

describe('parseExplanations', () => {
  it('extrae el arreglo JSON aunque venga con texto o cercas de código alrededor', () => {
    const raw = 'Claro:\n```json\n[{"id":2,"razon":"Comparte React con tus postulaciones."}]\n```'
    const result = parseExplanations(raw, [2, 5])
    expect(result.get(2)).toBe('Comparte React con tus postulaciones.')
  })

  it('ignora ids que no estaban entre las candidatas, para que el modelo no invente ofertas', () => {
    const raw = '[{"id":99,"razon":"inventada"},{"id":5,"razon":"Datos"}]'
    const result = parseExplanations(raw, [2, 5])
    expect(result.has(99)).toBe(false)
    expect(result.get(5)).toBe('Datos')
  })

  it('lanza AiUnavailableError si no hay JSON utilizable', () => {
    expect(() => parseExplanations('no es json', [2])).toThrow(AiUnavailableError)
    expect(() => parseExplanations('[{"id":99,"razon":"x"}]', [2])).toThrow(AiUnavailableError)
  })
})
