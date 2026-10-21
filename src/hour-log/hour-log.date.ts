import { BadRequestException } from '@nestjs/common'

export const CALENDAR_DATE_MESSAGE = 'La fecha debe ser un día calendario válido en formato YYYY-MM-DD'
const CALENDAR_DATE_INPUT = /^(\d{4}-\d{2}-\d{2})(?:T00:00:00(?:\.000)?Z)?$/

/** Un día calendario; el ISO de medianoche UTC es su representación heredada, no un instante. */
export function parseCalendarDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null
  const match = CALENDAR_DATE_INPUT.exec(value)
  if (!match) return null
  const date = new Date(`${match[1]}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === match[1] && date.getUTCFullYear() > 0
    ? date
    : null
}

/** Se comprueba también al arrancar, antes de recibir registros. */
export function institutionTimeZone(): string {
  const zone = (process.env.INSTITUTION_TIME_ZONE ?? 'America/Guayaquil').trim()
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone })
  } catch {
    throw new Error(`INSTITUTION_TIME_ZONE debe ser una zona horaria IANA válida; recibido: "${zone}"`)
  }
  return zone
}

export function institutionToday(now: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(now).map(({ type, value }) => [type, value]),
  )
  return `${parts.year.padStart(4, '0')}-${parts.month}-${parts.day}`
}

/** Normalización compartida por HTTP y sync; los extremos del periodo son días inclusivos. */
export function normalizeHourLogDate(
  value: unknown,
  placement: { startDate: Date; endDate: Date },
  now = new Date(),
): Date {
  const date = parseCalendarDate(value)
  if (!date) throw new BadRequestException(CALENDAR_DATE_MESSAGE)
  // El periodo usa el mismo convenio de día calendario almacenado en UTC.
  const day = date.toISOString().slice(0, 10)
  const start = placement.startDate.toISOString().slice(0, 10)
  const end = placement.endDate.toISOString().slice(0, 10)
  if (day < start || day > end) {
    throw new BadRequestException(`La fecha debe estar entre ${start} y ${end} (inclusive)`)
  }
  const zone = institutionTimeZone()
  const today = institutionToday(now, zone)
  if (day > today) {
    throw new BadRequestException(`No se pueden registrar horas con fecha futura; hoy es ${today} en ${zone}`)
  }
  return date
}
