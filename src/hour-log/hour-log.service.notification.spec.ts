import { PlacementStatus } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HourLogNotifier } from './hour-log-notification.service'
import { HourLogService } from './hour-log.service'

const prisma = {
  placement: { findUnique: vi.fn() },
  hourLog: { create: vi.fn() },
}

const activePlacement = {
  id: 1,
  studentId: 5,
  tutorId: 7,
  status: PlacementStatus.ACTIVE,
  startDate: new Date('2026-03-01'),
  endDate: new Date('2026-07-31'),
}

describe('HourLogService notifications', () => {
  let notifyTutor: ReturnType<typeof vi.fn>
  let service: HourLogService

  beforeEach(() => {
    vi.clearAllMocks()
    notifyTutor = vi.fn()
    service = new HourLogService(prisma as never, { notifyTutor } satisfies HourLogNotifier)
  })

  it('notifies the assigned tutor after the record has been persisted', async () => {
    prisma.placement.findUnique.mockResolvedValue(activePlacement)
    prisma.hourLog.create.mockImplementation(({ data }) => Promise.resolve({ id: 99, ...data }))

    await service.create(
      { placementId: 1, date: '2026-04-01', startTime: '08:00', endTime: '12:00', hours: 4, activity: 'Soporte' },
      5,
    )

    expect(prisma.hourLog.create).toHaveBeenCalledOnce()
    expect(notifyTutor).toHaveBeenCalledWith(7, 99)
  })

  it('does not notify when persistence fails', async () => {
    prisma.placement.findUnique.mockResolvedValue(activePlacement)
    prisma.hourLog.create.mockRejectedValue(new Error('database unavailable'))

    await expect(
      service.create(
        { placementId: 1, date: '2026-04-01', startTime: '08:00', endTime: '12:00', hours: 4, activity: 'Soporte' },
        5,
      ),
    ).rejects.toThrow('database unavailable')
    expect(notifyTutor).not.toHaveBeenCalled()
  })
})
