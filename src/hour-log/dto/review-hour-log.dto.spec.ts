import { HourLogStatus } from '@prisma/client'
import { validate } from 'class-validator'
import { describe, expect, it } from 'vitest'
import { ReviewHourLogDto } from './review-hour-log.dto'

describe('ReviewHourLogDto', () => {
  it('accepts an allowed status with an omitted note', async () => {
    await expect(validate(Object.assign(new ReviewHourLogDto(), { status: HourLogStatus.APPROVED }))).resolves.toHaveLength(0)
  })

  it('accepts a review note within the length limit', async () => {
    const dto = Object.assign(new ReviewHourLogDto(), { status: HourLogStatus.REJECTED, note: 'Falta evidencia' })

    await expect(validate(dto)).resolves.toHaveLength(0)
  })

  it('rejects statuses other than APPROVED or REJECTED', async () => {
    const dto = Object.assign(new ReviewHourLogDto(), { status: HourLogStatus.SUBMITTED })

    await expect(validate(dto)).resolves.toContainEqual(expect.objectContaining({ property: 'status' }))
  })

  it('rejects a non-string or too-long review note', async () => {
    const nonString = Object.assign(new ReviewHourLogDto(), { status: HourLogStatus.APPROVED, note: 9 })
    const tooLong = Object.assign(new ReviewHourLogDto(), { status: HourLogStatus.APPROVED, note: 'a'.repeat(301) })

    await expect(validate(nonString)).resolves.toContainEqual(expect.objectContaining({ property: 'note' }))
    await expect(validate(tooLong)).resolves.toContainEqual(expect.objectContaining({ property: 'note' }))
  })
})
