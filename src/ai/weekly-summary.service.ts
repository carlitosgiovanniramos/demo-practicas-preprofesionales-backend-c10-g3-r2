import { BadRequestException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common'
import { Role } from '@prisma/client'
import { HourLogService } from '../hour-log/hour-log.service'
import { PrismaService } from '../prisma/prisma.service'
import { AI_GENERATION_PROVIDER, AiUnavailableError, type AiTextProvider } from './ai-provider'
import { buildWeeklySummaryPrompt, weekRange } from './weekly-summary'

export interface WeeklySummaryResult {
  placementId: number
  weekStart: string
  totalHours: number
  entries: number
  draft: string | null
}

@Injectable()
export class WeeklySummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hourLogs: HourLogService,
    @Inject(AI_GENERATION_PROVIDER) private readonly provider: AiTextProvider,
  ) {}

  /** Borrador del informe semanal a partir de las jornadas reales de esa semana. */
  async draft(placementId: number, weekStart: string, userId: number, role: Role): Promise<WeeklySummaryResult> {
    const range = weekRange(weekStart)
    if (!range) throw new BadRequestException('weekStart debe ser una fecha real con formato AAAA-MM-DD')
    await this.hourLogs.assertPlacementAccess(placementId, userId, role)

    const entries = await this.prisma.hourLog.findMany({
      where: { placementId, deletedAt: null, date: { gte: range.from, lt: range.to } },
      orderBy: { date: 'asc' },
      select: { date: true, startTime: true, endTime: true, hours: true, activity: true },
    })
    const totalHours = entries.reduce((sum, e) => sum + e.hours, 0)
    if (entries.length === 0) return { placementId, weekStart, totalHours, entries: 0, draft: null }

    try {
      const draft = await this.provider.generateText(buildWeeklySummaryPrompt(entries))
      return { placementId, weekStart, totalHours, entries: entries.length, draft }
    } catch (error) {
      if (error instanceof AiUnavailableError) throw new ServiceUnavailableException(error.message)
      throw error
    }
  }
}
