import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CALENDAR_DATE_MESSAGE, institutionTimeZone, institutionToday, normalizeHourLogDate, parseCalendarDate,
} from './hour-log.date'

const period = { startDate: new Date('2026-03-01'), endDate: new Date('2026-07-31') }
const now = new Date('2026-04-02T02:00:00.000Z') // 1 de abril en Guayaquil, 2 en Tokio.

beforeEach(() => vi.stubEnv('INSTITUTION_TIME_ZONE', 'America/Guayaquil'))
afterEach(() => vi.unstubAllEnvs())

describe('día calendario de una jornada', () => {
  it.each(['2026-04-01', '2026-04-01T00:00:00Z', '2026-04-01T00:00:00.000Z'])(
    'normaliza %s sin desplazar el día a la víspera en Ecuador', (value) => {
      expect(normalizeHourLogDate(value, period, now).toISOString()).toBe('2026-04-01T00:00:00.000Z')
    },
  )

  it.each([
    null, undefined, 20260401, {}, '', '2026-4-1', '2026-02-30', '2026-02-29', '0000-01-01',
    '2026-04-01T23:00:00Z', '2026-04-01T00:00:00-05:00', '2026-04-01T00:00:00', '2026-04-01 extra',
  ])('rechaza un día inexistente o un instante ambiguo: %j', (value) => {
    expect(parseCalendarDate(value)).toBeNull()
    expect(() => normalizeHourLogDate(value, period, now)).toThrow(CALENDAR_DATE_MESSAGE)
  })

  it('acepta el día bisiesto real', () => {
    expect(parseCalendarDate('2024-02-29')?.toISOString()).toBe('2024-02-29T00:00:00.000Z')
  })

  it.each(['2026-02-28', '2026-08-01'])('rechaza %s informando ambos límites', (day) => {
    expect(() => normalizeHourLogDate(day, period, now)).toThrow('entre 2026-03-01 y 2026-07-31 (inclusive)')
  })

  it.each(['2026-03-01', '2026-07-31'])('acepta el extremo inclusivo %s', (day) => {
    expect(normalizeHourLogDate(day, period, new Date('2026-08-02T12:00:00Z')).toISOString().slice(0, 10)).toBe(day)
  })

  it('rechaza mañana aunque UTC y el dispositivo ya estén en ese día', () => {
    vi.stubEnv('TZ', 'Asia/Tokyo')
    expect(() => normalizeHourLogDate('2026-04-02', period, now)).toThrow('hoy es 2026-04-01 en America/Guayaquil')
  })

  it('la zona configurada determina hoy sin desplazar el día elegido', () => {
    vi.stubEnv('INSTITUTION_TIME_ZONE', 'Asia/Tokyo')
    expect(normalizeHourLogDate('2026-04-02', period, now).toISOString()).toBe('2026-04-02T00:00:00.000Z')
  })

  it('permite el nuevo día exactamente desde la medianoche institucional', () => {
    expect(() => normalizeHourLogDate('2026-04-02', period, new Date('2026-04-02T04:59:59Z'))).toThrow('fecha futura')
    expect(normalizeHourLogDate('2026-04-02', period, new Date('2026-04-02T05:00:00Z')).toISOString().slice(0, 10)).toBe('2026-04-02')
  })

  it.each([
    ['2026-03-08T06:59:59Z', '2026-03-08'], ['2026-03-08T07:00:00Z', '2026-03-08'],
    ['2026-11-01T05:59:59Z', '2026-11-01'], ['2026-11-01T06:00:00Z', '2026-11-01'],
  ])('respeta el cambio de horario de verano en %s', (instant, day) => {
    expect(institutionToday(new Date(instant), 'America/New_York')).toBe(day)
  })

  it.each(['', 'zona/inexistente'])('detecta la configuración inválida %j', (zone) => {
    vi.stubEnv('INSTITUTION_TIME_ZONE', zone)
    expect(institutionTimeZone).toThrow('INSTITUTION_TIME_ZONE')
  })

  it('usa Guayaquil por defecto', () => {
    vi.stubEnv('INSTITUTION_TIME_ZONE', undefined)
    expect(institutionTimeZone()).toBe('America/Guayaquil')
  })
})
