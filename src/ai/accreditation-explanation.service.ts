import { Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { AccreditationService } from '../placement/accreditation.service'
import type { AccreditationResult } from '../placement/accreditation'
import { AI_TEXT_PROVIDER, AiUnavailableError, type AiTextProvider } from './ai-provider'
import { buildAccreditationPrompt } from './accreditation-explanation'

export interface AccreditationExplanation {
  placementId: number
  period: string
  level: AccreditationResult['level']
  reasons: string[]
  explanation: string
}

@Injectable()
export class AccreditationExplanationService {
  constructor(
    private readonly accreditation: AccreditationService,
    @Inject(AI_TEXT_PROVIDER) private readonly provider: AiTextProvider,
  ) {}

  /** Explica el estado de un placement. El nivel viene de la regla, no del modelo. */
  async explainPlacement(placementId: number, period: string): Promise<AccreditationExplanation> {
    const results = await this.accreditation.reportForPeriod(period)
    const result = results.find((r) => r.placementId === placementId)
    if (!result) throw new NotFoundException('placement no encontrado en ese periodo')
    return this.toExplanation(result, period)
  }

  private async toExplanation(result: AccreditationResult, period: string): Promise<AccreditationExplanation> {
    try {
      const explanation = await this.provider.generateText(buildAccreditationPrompt(result))
      return {
        placementId: result.placementId,
        period,
        level: result.level,
        reasons: result.reasons,
        explanation,
      }
    } catch (error) {
      if (error instanceof AiUnavailableError) throw new ServiceUnavailableException(error.message)
      throw error
    }
  }
}
