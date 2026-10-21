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

export interface SimulatedBatchResult {
  simulated: true
  period: string
  total: number
  explained: number
  failed: number
  items: AccreditationExplanation[]
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

  /**
   * Lote simulado: explica todos los placements del periodo, uno por uno.
   * Un fallo puntual no detiene el lote; se cuenta en `failed`.
   */
  async simulatedBatch(period: string): Promise<SimulatedBatchResult> {
    const results = await this.accreditation.reportForPeriod(period)
    const items: AccreditationExplanation[] = []
    let failed = 0
    for (const result of results) {
      try {
        items.push(await this.toExplanation(result, period))
      } catch {
        failed += 1
      }
    }
    return { simulated: true, period, total: results.length, explained: items.length, failed, items }
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
