const DEFAULT_ACCESS_TTL_SECONDS = 15 * 60
const DEFAULT_REFRESH_TTL_DAYS = 7

function readPositiveInteger(
  name: string,
  value: string | undefined,
  fallback: number,
  max: number,
): number {
  if (value === undefined || value.trim() === '') return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    throw new Error(`${name} debe ser un entero entre 1 y ${max}`)
  }
  return parsed
}

export function readAccessTokenTtlSeconds(env: NodeJS.ProcessEnv = process.env): number {
  return readPositiveInteger('JWT_ACCESS_TTL_SECONDS', env.JWT_ACCESS_TTL_SECONDS, DEFAULT_ACCESS_TTL_SECONDS, 60 * 60)
}

export function readRefreshTokenTtlDays(env: NodeJS.ProcessEnv = process.env): number {
  return readPositiveInteger('JWT_REFRESH_TTL_DAYS', env.JWT_REFRESH_TTL_DAYS, DEFAULT_REFRESH_TTL_DAYS, 365)
}
