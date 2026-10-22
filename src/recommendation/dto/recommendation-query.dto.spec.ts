import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { describe, expect, it } from 'vitest'
import { RecommendationQueryDto } from './recommendation-query.dto'

async function check(plain: Record<string, unknown>) {
  const dto = plainToInstance(RecommendationQueryDto, plain)
  const errors = await validate(dto)
  return { dto, valid: errors.length === 0 }
}

describe('RecommendationQueryDto', () => {
  it('usa 10 como límite y sin explicación por defecto', async () => {
    const { dto, valid } = await check({})
    expect(valid).toBe(true)
    expect(dto.limit).toBe(10)
    expect(dto.explain).toBe('false')
  })

  it('convierte el límite de texto a número y acepta 1..50', async () => {
    expect((await check({ limit: '5' })).dto.limit).toBe(5)
    expect((await check({ limit: '1' })).valid).toBe(true)
    expect((await check({ limit: '50' })).valid).toBe(true)
  })

  it('rechaza límites fuera de rango o no numéricos', async () => {
    expect((await check({ limit: '0' })).valid).toBe(false)
    expect((await check({ limit: '51' })).valid).toBe(false)
    expect((await check({ limit: 'diez' })).valid).toBe(false)
  })

  it('solo acepta explain=true o explain=false', async () => {
    expect((await check({ explain: 'true' })).valid).toBe(true)
    expect((await check({ explain: 'quizas' })).valid).toBe(false)
  })
})
