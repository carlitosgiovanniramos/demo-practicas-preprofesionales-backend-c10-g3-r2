import { describe, expect, it } from 'vitest'
import { readJwtSecret } from './jwt-secret'

describe('readJwtSecret', () => {
  it('fails naming the missing variable when JWT_SECRET is not set', () => {
    expect(() => readJwtSecret({})).toThrow('Falta la variable de entorno JWT_SECRET')
  })

  it('fails when JWT_SECRET is empty or only whitespace', () => {
    expect(() => readJwtSecret({ JWT_SECRET: '' })).toThrow('JWT_SECRET')
    expect(() => readJwtSecret({ JWT_SECRET: '   ' })).toThrow('JWT_SECRET')
  })

  it('returns the configured secret', () => {
    expect(readJwtSecret({ JWT_SECRET: 'un-secreto-largo' })).toBe('un-secreto-largo')
  })
})
