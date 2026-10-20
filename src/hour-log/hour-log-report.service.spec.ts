import { NotFoundException } from '@nestjs/common'
import { HourLogStatus } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HourLogReportService } from './hour-log-report.service'

const prisma = {
  placement: { findUnique: vi.fn() },
  hourLog: { aggregate: vi.fn(), count: vi.fn(), findMany: vi.fn() },
}

describe('HourLogReportService', () => {
  let service: HourLogReportService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new HourLogReportService(prisma as never)
  })

  it('sums approved hours and returns zero when there are no approved records', async () => {
    prisma.hourLog.aggregate.mockResolvedValueOnce({ _sum: { hours: 12.5 } }).mockResolvedValueOnce({ _sum: { hours: null } })

    await expect(service.approvedHours(3)).resolves.toBe(12.5)
    await expect(service.approvedHours(3)).resolves.toBe(0)
    expect(prisma.hourLog.aggregate).toHaveBeenCalledWith({
      where: { placementId: 3, status: HourLogStatus.APPROVED, deletedAt: null },
      _sum: { hours: true },
    })
  })

  it('builds a progress report with approved and pending hours', async () => {
    prisma.placement.findUnique.mockResolvedValue({ requiredHours: 100 })
    prisma.hourLog.aggregate.mockResolvedValue({ _sum: { hours: 40 } })
    prisma.hourLog.count.mockResolvedValue(2)

    await expect(service.progressReport(9)).resolves.toEqual({
      placementId: 9,
      requiredHours: 100,
      approvedHours: 40,
      pendingLogs: 2,
      percentage: 40,
    })
  })

  it('rejects a report for a missing placement', async () => {
    prisma.placement.findUnique.mockResolvedValue(null)

    await expect(service.progressReport(9)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('groups approved and submitted hours by chronological ISO week, skipping other statuses', async () => {
    prisma.placement.findUnique.mockResolvedValue({
      startDate: new Date(2025, 11, 29, 12),
      endDate: new Date(2026, 0, 11, 12),
      requiredHours: 40,
    })
    prisma.hourLog.findMany.mockResolvedValue([
      { date: new Date(2026, 0, 4, 12), status: HourLogStatus.SUBMITTED, hours: 2 },
      { date: new Date(2025, 11, 29, 12), status: HourLogStatus.APPROVED, hours: 5 },
      { date: new Date(2026, 0, 5, 12), status: HourLogStatus.REJECTED, hours: 9 },
      { date: new Date(2025, 11, 30, 12), status: HourLogStatus.APPROVED, hours: 3 },
      { date: new Date(2026, 0, 6, 12), status: HourLogStatus.DRAFT, hours: 7 },
    ])

    await expect(service.weeklySummary(4)).resolves.toEqual([
      { week: '2026-W01', approvedHours: 8, submittedHours: 2, logsCount: 3, expectedHoursPercentage: 40 },
    ])
  })

  it('returns no weekly buckets when there are no eligible logs', async () => {
    prisma.placement.findUnique.mockResolvedValue({
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-01-01'),
      requiredHours: 20,
    })
    prisma.hourLog.findMany.mockResolvedValue([{ date: new Date('2026-01-01'), status: HourLogStatus.REJECTED, hours: 4 }])

    await expect(service.weeklySummary(4)).resolves.toEqual([])
  })

  it('rejects a weekly summary for a missing placement', async () => {
    prisma.placement.findUnique.mockResolvedValue(null)

    await expect(service.weeklySummary(4)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('uses zero expected percentage when the placement requires no hours', async () => {
    prisma.placement.findUnique.mockResolvedValue({
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-01-08'),
      requiredHours: 0,
    })
    prisma.hourLog.findMany.mockResolvedValue([
      { date: new Date('2026-01-01'), status: HourLogStatus.APPROVED, hours: 3 },
    ])

    await expect(service.weeklySummary(4)).resolves.toMatchObject([{ expectedHoursPercentage: 0 }])
  })
})
