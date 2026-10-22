import { BadRequestException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HourLogService } from './hour-log.service'
import { HOUR_LOG_HOURS_MESSAGE, HOUR_LOG_LIMITS } from './hour-log.rules'

const period = { startDate: new Date('2026-03-01'), endDate: new Date('2026-07-31') }

const prisma = {
  hourLog: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn(), aggregate: vi.fn() },
  placement: { findUnique: vi.fn() },
}

describe('HourLogService', () => {
  let service: HourLogService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new HourLogService(prisma as never)
  })

  it('creates an hour log in SUBMITTED for an active placement', async () => {
    prisma.placement.findUnique.mockResolvedValue({ id: 1, studentId: 5, tutorId: 7, status: 'ACTIVE', ...period })
    prisma.hourLog.create.mockImplementation(({ data }) => Promise.resolve({ id: 99, ...data }))

    const result = await service.create(
      { placementId: 1, date: '2026-04-01', startTime: '08:00', endTime: '12:00', hours: 4, activity: 'Desarrollo de módulo de reportes' },
      5,
    )

    expect(result.status).toBe('SUBMITTED')
    expect(result.hours).toBe(4)
  })

  it('rejects an hour log with more hours than the service allows', async () => {
    prisma.placement.findUnique.mockResolvedValue({ id: 1, studentId: 5, tutorId: 7, status: 'ACTIVE', ...period })

    await expect(
      service.create(
        { placementId: 1, date: '2026-04-01', startTime: '08:00', endTime: '20:00', hours: 11, activity: 'Jornada larga de soporte' },
        5,
      ),
    ).rejects.toThrow(BadRequestException)
  })

  it('accepts exactly the shared maximum of hours', async () => {
    prisma.placement.findUnique.mockResolvedValue({ id: 1, studentId: 5, tutorId: 7, status: 'ACTIVE', ...period })
    prisma.hourLog.create.mockImplementation(({ data }) => Promise.resolve({ id: 99, ...data }))

    const result = await service.create(
      { placementId: 1, date: '2026-04-01', startTime: '08:00', endTime: '16:00', hours: HOUR_LOG_LIMITS.maxHours, activity: 'Jornada completa de soporte' },
      5,
    )

    expect(result.hours).toBe(HOUR_LOG_LIMITS.maxHours)
  })

  it('rejects 9 hours with the shared message (D-06: the service used to allow up to 10)', async () => {
    prisma.placement.findUnique.mockResolvedValue({ id: 1, studentId: 5, tutorId: 7, status: 'ACTIVE', ...period })

    await expect(
      service.create(
        { placementId: 1, date: '2026-04-01', startTime: '08:00', endTime: '17:00', hours: 9, activity: 'Jornada larga de soporte' },
        5,
      ),
    ).rejects.toThrow(HOUR_LOG_HOURS_MESSAGE)
    expect(prisma.hourLog.create).not.toHaveBeenCalled()
  })

  it.each(['APPROVED', 'REJECTED'] as const)('rejects a foreign tutor reviewing a submitted log as %s without updating it', async (status) => {
    prisma.hourLog.findUnique.mockResolvedValue({ id: 99, placementId: 1, status: 'SUBMITTED', version: 1 })
    prisma.placement.findUnique.mockResolvedValue({ id: 1, tutorId: 7 })

    await expect(service.review(99, status as never, 8, 'review')).rejects.toMatchObject({ status: 403 })

    expect(prisma.placement.findUnique).toHaveBeenCalledWith({ where: { id: 1 } })
    expect(prisma.hourLog.update).not.toHaveBeenCalled()
  })

  it.each(['APPROVED', 'REJECTED'] as const)('allows the assigned tutor to review a submitted log as %s', async (status) => {
    prisma.hourLog.findUnique.mockResolvedValue({ id: 99, placementId: 1, status: 'SUBMITTED', version: 1 })
    prisma.placement.findUnique.mockResolvedValue({ id: 1, tutorId: 7 })
    prisma.hourLog.update.mockImplementation(({ data }) => Promise.resolve({ id: 99, ...data }))

    const result = await service.review(99, status as never, 7, 'review')

    expect(result.status).toBe(status)
    expect(result.reviewedById).toBe(7)
    expect(prisma.hourLog.update).toHaveBeenCalledOnce()
  })
})
