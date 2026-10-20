import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { describe, expect, it } from 'vitest'
import { CreateHourLogDto } from './create-hour-log.dto'

const validInput = () => ({
  placementId: 1,
  date: '2026-04-01',
  startTime: '08:00',
  endTime: '12:00',
  hours: 4,
  activity: 'Soporte',
})

describe('CreateHourLogDto', () => {
  it('accepts a complete record with valid times and activity', async () => {
    const dto = plainToInstance(CreateHourLogDto, validInput())

    await expect(validate(dto)).resolves.toHaveLength(0)
  })

  it('rejects invalid identifiers, dates, times, hour range and activity values', async () => {
    const dto = plainToInstance(CreateHourLogDto, {
      placementId: 'one',
      date: 'not-a-date',
      startTime: '8:00',
      endTime: '25:00',
      hours: 13,
      activity: 123,
    })

    const errors = await validate(dto)

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['placementId', 'date', 'startTime', 'endTime', 'hours', 'activity']),
    )
  })

  it.each([0, 0.4, 12.1])('rejects hours outside the DTO range: %s', async (hours) => {
    const dto = plainToInstance(CreateHourLogDto, { ...validInput(), hours })

    await expect(validate(dto)).resolves.toContainEqual(expect.objectContaining({ property: 'hours' }))
  })

  it('rejects an activity longer than 500 characters', async () => {
    const dto = plainToInstance(CreateHourLogDto, { ...validInput(), activity: 'a'.repeat(501) })

    await expect(validate(dto)).resolves.toContainEqual(expect.objectContaining({ property: 'activity' }))
  })
})
