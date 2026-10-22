import { AiUnavailableError, type AiTextProvider } from './ai-provider'
import { FallbackTextProvider } from './fallback-provider'
import { GeminiTextProvider } from './gemini-provider'
import { MiniMaxTextProvider } from './minimax-provider'

/**
 * Arma el proveedor a partir del entorno. `AI_PROVIDERS` define el orden (por defecto `gemini`).
 * Solo entran los proveedores con clave. Sin ninguno, responde 503 en cada llamada (nunca texto falso).
 */
export function buildTextProvider(env: NodeJS.ProcessEnv = process.env): AiTextProvider {
  const order = (env.AI_PROVIDERS || 'gemini')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean)

  const providers: AiTextProvider[] = []
  for (const name of order) {
    if (name === 'gemini' && env.GEMINI_API_KEY) {
      providers.push(new GeminiTextProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL || undefined))
    }
    if (name === 'minimax' && env.MINIMAX_API_KEY) {
      providers.push(new MiniMaxTextProvider(env.MINIMAX_API_KEY, env.MINIMAX_MODEL || undefined))
    }
  }

  if (providers.length === 0) {
    return {
      generateText: async () => {
        throw new AiUnavailableError('no hay clave de IA configurada (GEMINI_API_KEY o MINIMAX_API_KEY)')
      },
    }
  }
  return providers.length === 1 ? providers[0] : new FallbackTextProvider(providers)
}
