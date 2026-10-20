import { Injectable, NotFoundException } from '@nestjs/common'
import { HourLogStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

type WeeklyBucket = { approvedHours: number; submittedHours: number; logsCount: number }

export type WeeklyHourLogSummary = {
  week: string
  approvedHours: number
  submittedHours: number
  logsCount: number
  expectedHoursPercentage: number
}

@Injectable()
export class HourLogReportService {
  constructor(private readonly prisma: PrismaService) {}

  async approvedHours(placementId: number): Promise<number> {
    const result = await this.prisma.hourLog.aggregate({
      where: { placementId, status: HourLogStatus.APPROVED, deletedAt: null },
      _sum: { hours: true },
    })
    return result._sum.hours ?? 0
  }

  async progressReport(placementId: number) {
    const placement = await this.prisma.placement.findUnique({ where: { id: placementId } })
    if (!placement) throw new NotFoundException('placement no encontrado')

    const approvedHours = await this.approvedHours(placementId)
    const pendingLogs = await this.prisma.hourLog.count({
      where: { placementId, status: HourLogStatus.SUBMITTED, deletedAt: null },
    })

    return {
      placementId,
      requiredHours: placement.requiredHours,
      approvedHours,
      pendingLogs,
      percentage: Math.round((approvedHours / placement.requiredHours) * 100),
    }
  }

  async weeklySummary(placementId: number): Promise<WeeklyHourLogSummary[]> {
    const placement = await this.prisma.placement.findUnique({ where: { id: placementId } })
    if (!placement) throw new NotFoundException('placement no encontrado')

    const logs = await this.prisma.hourLog.findMany({
      where: { placementId, deletedAt: null },
      orderBy: { date: 'asc' },
    })
    const expectedHoursPerWeek = this.expectedHoursPerWeek(
      placement.startDate,
      placement.endDate,
      placement.requiredHours,
    )
    const buckets = this.groupWeeklyLogs(logs)

    return [...buckets.entries()]
      .map(([week, bucket]) => ({
        week,
        ...bucket,
        expectedHoursPercentage:
          expectedHoursPerWeek > 0 ? Math.round((bucket.approvedHours / expectedHoursPerWeek) * 100) : 0,
      }))
      .sort((first, second) => first.week.localeCompare(second.week))
  }

  private expectedHoursPerWeek(startDate: Date, endDate: Date, requiredHours: number): number {
    const totalDays = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000))
    const totalWeeks = Math.max(1, Math.ceil(totalDays / 7))
    return requiredHours / totalWeeks
  }

  private groupWeeklyLogs(
    logs: { date: Date; status: HourLogStatus; hours: number }[],
  ): Map<string, WeeklyBucket> {
    const buckets = new Map<string, WeeklyBucket>()
    for (const log of logs) {
      if (log.status !== HourLogStatus.APPROVED && log.status !== HourLogStatus.SUBMITTED) continue

      const week = this.isoWeekLabel(log.date)
      const bucket = buckets.get(week) ?? { approvedHours: 0, submittedHours: 0, logsCount: 0 }
      if (log.status === HourLogStatus.APPROVED) bucket.approvedHours += log.hours
      else bucket.submittedHours += log.hours
      bucket.logsCount += 1
      buckets.set(week, bucket)
    }
    return buckets
  }

  private isoWeekLabel(date: Date): string {
    const copy = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    const isoDayNumber = copy.getUTCDay() === 0 ? 7 : copy.getUTCDay()
    copy.setUTCDate(copy.getUTCDate() + 4 - isoDayNumber)

    const yearStart = new Date(Date.UTC(copy.getUTCFullYear(), 0, 1))
    const daysSinceYearStart = (copy.getTime() - yearStart.getTime()) / 86400000
    const weekNumber = Math.ceil((daysSinceYearStart + 1) / 7)
    return `${copy.getUTCFullYear()}-W${String(weekNumber).padStart(2, '0')}`
  }
}
