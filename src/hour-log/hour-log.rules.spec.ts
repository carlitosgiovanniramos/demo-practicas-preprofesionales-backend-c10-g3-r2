import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { describe, expect, it } from 'vitest'
import { CreateHourLogDto } from './dto/create-hour-log.dto'
import { HOUR_LOG_HOURS_MESSAGE, HOUR_LOG_LIMITS, hourLogRangeError } from './hour-log.rules'

const window = { startTime: '08:00', endTime: '12:00' }

// D-06: una sola definición de registro de horas válido. Los bordes se derivan
// de HOUR_LOG_LIMITS: cambiar el límite en un solo lugar mueve también estas pruebas.
describe('regla única de horas por registro (D-06)', () => {
  it('fija el mínimo en 0.5 y el máximo en 8 horas', () => {
    expect(HOUR_LOG_LIMITS).toEqual({ minHours: 0.5, maxHours: 8 })
  })

  it('acepta exactamente los dos bordes', () => {
    expect(hourLogRangeError({ hours: HOUR_LOG_LIMITS.minHours, ...window })).toBeNull()
    expect(hourLogRangeError({ hours: HOUR_LOG_LIMITS.maxHours, ...window })).toBeNull()
  })

  it.each([0, HOUR_LOG_LIMITS.minHours - 0.1, HOUR_LOG_LIMITS.maxHours + 0.5, 12, Number.NaN])(
    'rechaza %s horas con el mensaje único',
    (hours) => {
      expect(hourLogRangeError({ hours, ...window })).toBe(HOUR_LOG_HOURS_MESSAGE)
    },
  )

  it('usa el mensaje exacto que ve el estudiante', () => {
    expect(HOUR_LOG_HOURS_MESSAGE).toBe('Las horas deben estar entre 0.5 y 8 por registro')
  })

  it('rechaza una hora de inicio que no es anterior a la de fin', () => {
    expect(hourLogRangeError({ hours: 4, startTime: '12:00', endTime: '08:00' })).toBe(
      'la hora de inicio debe ser anterior a la de fin',
    )
  })

  it('el DTO aplica la misma regla: acepta el máximo y rechaza superarlo con el mismo mensaje', async () => {
    const dto = (hours: number) =>
      plainToInstance(CreateHourLogDto, {
        placementId: 1,
        date: '2026-04-01',
        ...window,
        hours,
        activity: 'Soporte',
      })

    expect(await validate(dto(HOUR_LOG_LIMITS.maxHours))).toHaveLength(0)
    const errors = await validate(dto(HOUR_LOG_LIMITS.maxHours + 0.5))
    expect(JSON.stringify(errors)).toContain(HOUR_LOG_HOURS_MESSAGE)
  })
})
