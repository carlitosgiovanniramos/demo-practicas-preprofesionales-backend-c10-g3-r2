import { Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { Role } from '@prisma/client'
import { HourLogService } from '../hour-log/hour-log.service'
import { AccreditationService } from '../placement/accreditation.service'
import { PrismaService } from '../prisma/prisma.service'
import { AI_TEXT_PROVIDER, AiUnavailableError, type AiTextProvider } from './ai-provider'
import { buildActionPlanPrompt } from './action-plan'

@Injectable()
export class ActionPlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hourLogs: HourLogService,
    private readonly accreditation: AccreditationService,
    @Inject(AI_TEXT_PROVIDER) private readonly provider: AiTextProvider,
  ) {}

  /** Lo ven el coordinador, el tutor y el estudiante dueño del placement. */
  async get(placementId: number, userId: number, role: Role) {
    await this.hourLogs.assertPlacementAccess(placementId, userId, role)
    const plan = await this.prisma.actionPlan.findUnique({ where: { placementId } })
    // Nest responde `null` con cuerpo vacío, que el cliente no puede parsear: siempre devolvemos un objeto.
    return plan ?? { placementId, content: null, updatedAt: null }
  }

  /** Crea o reemplaza el plan del placement. Solo el coordinador lo edita (lo impone el controlador). */
  async save(placementId: number, content: string, userId: number, role: Role) {
    await this.hourLogs.assertPlacementAccess(placementId, userId, role)
    return this.prisma.actionPlan.upsert({
      where: { placementId },
      create: { placementId, content },
      update: { content },
    })
  }

  /** Borrador con IA para que el coordinador lo revise y edite. No guarda nada. */
  async draft(placementId: number, period: string): Promise<{ draft: string }> {
    const results = await this.accreditation.reportForPeriod(period)
    const report = results.find((r) => r.placementId === placementId)
    if (!report) throw new NotFoundException('placement no encontrado en ese periodo')
    try {
      return { draft: await this.provider.generateText(buildActionPlanPrompt(report)) }
    } catch (error) {
      if (error instanceof AiUnavailableError) throw new ServiceUnavailableException(error.message)
      throw error
    }
  }
}
