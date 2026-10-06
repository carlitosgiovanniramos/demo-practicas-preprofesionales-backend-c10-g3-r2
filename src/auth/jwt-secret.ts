/**
 * Lee el secreto con el que se firman y verifican los JWT.
 *
 * No hay valor por defecto a propósito (D-07): si la variable falta o está
 * vacía, la aplicación no debe arrancar, para que nunca llegue a producción
 * firmando tokens con un secreto conocido.
 */
export function readJwtSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.JWT_SECRET?.trim()
  if (!secret) {
    throw new Error(
      'Falta la variable de entorno JWT_SECRET: la API no arranca sin el secreto de firma de tokens. ' +
        'Defínela en .env (ver .env.example y la sección "Variables de entorno" del README).',
    )
  }
  return secret
}
