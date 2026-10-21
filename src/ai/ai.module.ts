import { Module } from '@nestjs/common'
import { HourLogModule } from '../hour-log/hour-log.module'
import { PlacementModule } from '../placement/placement.module'
import { AccreditationAiController } from './accreditation-ai.controller'
import { AccreditationExplanationService } from './accreditation-explanation.service'
import { AI_TEXT_PROVIDER, AiUnavailableError, type AiTextProvider } from './ai-provider'
import { AiController } from './ai.controller'
import { GeminiTextProvider } from './gemini-provider'
import { WeeklySummaryService } from './weekly-summary.service'

/** Sin GEMINI_API_KEY el módulo arranca igual, pero cada llamada responde 503 (nunca texto falso). */
const unconfiguredProvider: AiTextProvider = {
  generateText: async () => {
    throw new AiUnavailableError('GEMINI_API_KEY no está configurada')
  },
}

@Module({
  imports: [HourLogModule, PlacementModule],
  controllers: [AiController, AccreditationAiController],
  providers: [
    {
      provide: AI_TEXT_PROVIDER,
      useFactory: (): AiTextProvider => {
        const apiKey = process.env.GEMINI_API_KEY
        if (!apiKey) return unconfiguredProvider
        return new GeminiTextProvider(apiKey, process.env.GEMINI_MODEL || undefined)
      },
    },
    WeeklySummaryService,
    AccreditationExplanationService,
  ],
  exports: [AI_TEXT_PROVIDER],
})
export class AiModule {}
