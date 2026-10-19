/**
 * Regla única de qué es un registro de horas válido (D-06).
 *
 * Cada punto del backend valida aquí: el DTO de creación, el servicio (crear y exportar)
 * y la sincronización. El frontend tiene su espejo en `src/lib/hour-log-rules.ts`.
 * Cambiar el límite es editar `HOUR_LOG_LIMITS` en ambos repos a la vez.
 */
export const HOUR_LOG_LIMITS = Object.freeze({ minHours: 0.5, maxHours: 8 })

export const HOUR_LOG_HOURS_MESSAGE = `Las horas deben estar entre ${HOUR_LOG_LIMITS.minHours} y ${HOUR_LOG_LIMITS.maxHours} por registro`

// Mismo texto que el frontend (src/lib/hour-log-rules.ts): el usuario ve el mismo mensaje venga de donde venga.
const TIME_ORDER_MESSAGE = 'La hora de fin debe ser posterior a la de inicio'

function toMinutes(time: string): number {
  const [hour, minute] = time.split(':').map(Number)
  return hour * 60 + minute
}

/** Devuelve el motivo por el que el registro no es válido, o `null` si lo es. */
export function hourLogRangeError(input: { hours: number; startTime: string; endTime: string }): string | null {
  // `!(a && b)` también rechaza NaN, que las comparaciones directas dejarían pasar.
  if (!(input.hours >= HOUR_LOG_LIMITS.minHours && input.hours <= HOUR_LOG_LIMITS.maxHours)) {
    return HOUR_LOG_HOURS_MESSAGE
  }
  if (toMinutes(input.startTime) >= toMinutes(input.endTime)) {
    return TIME_ORDER_MESSAGE
  }
  return null
}
