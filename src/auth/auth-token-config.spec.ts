import { describe, expect, it } from 'vitest'
import { readAccessTokenTtlSeconds, readRefreshTokenTtlDays } from './auth-token-config'

describe('auth token lifetime configuration', () => {
  it('uses short defaults when no values are configured', () => {
    expect(readAccessTokenTtlSeconds({})).toBe(900)
    expect(readRefreshTokenTtlDays({})).toBe(7)
  })

  it('reads positive integer overrides', () => {
    expect(readAccessTokenTtlSeconds({ JWT_ACCESS_TTL_SECONDS: '300' })).toBe(300)
    expect(readRefreshTokenTtlDays({ JWT_REFRESH_TTL_DAYS: '30' })).toBe(30)
  })

  it.each(['0', '-1', '1.5', 'abc', '3601'])('rejects invalid access-token TTL %s', (value) => {
    expect(() => readAccessTokenTtlSeconds({ JWT_ACCESS_TTL_SECONDS: value })).toThrow('JWT_ACCESS_TTL_SECONDS')
  })

  it.each(['0', '-1', '1.5', 'abc', '366'])('rejects invalid refresh-token TTL %s', (value) => {
    expect(() => readRefreshTokenTtlDays({ JWT_REFRESH_TTL_DAYS: value })).toThrow('JWT_REFRESH_TTL_DAYS')
  })
})
