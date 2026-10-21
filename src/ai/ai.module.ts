import { Module } from '@nestjs/common'
import { AI_TEXT_PROVIDER, AiUnavailableError, type AiTextProvider } from './ai-provider'
import { GeminiTextProvider } from './gemini-provider'

/** Sin GEMINI_API_KEY el módulo arranca igual, pero cada llamada responde 503 (nunca texto falso). */
const unconfiguredProvider: AiTextProvider = {
  generateText: async () => {
    throw new AiUnavailableError('GEMINI_API_KEY no está configurada')
  },
}

@Module({
  providers: [
    {
      provide: AI_TEXT_PROVIDER,
      useFactory: (): AiTextProvider => {
        const apiKey = process.env.GEMINI_API_KEY
        if (!apiKey) return unconfiguredProvider
        return new GeminiTextProvider(apiKey, process.env.GEMINI_MODEL || undefined)
      },
    },
  ],
  exports: [AI_TEXT_PROVIDER],
})
export class AiModule {}
