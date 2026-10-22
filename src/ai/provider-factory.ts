import { AiUnavailableError, type AiTextProvider } from './ai-provider'
import { FallbackTextProvider } from './fallback-provider'
import { GeminiTextProvider } from './gemini-provider'
import { MiniMaxTextProvider } from './minimax-provider'

/**
 * Orden por defecto de cada tarea. La generación también va por MiniMax: Gemini cobra por uso y
 * ya generó gasto en pruebas. Para volver a Gemini, AI_GENERATION_PROVIDERS=gemini.
 */
export const DEFAULT_GENERATION_ORDER = 'minimax'
export const DEFAULT_CLASSIFICATION_ORDER = 'minimax'

/**
 * Arma el proveedor de una tarea a partir de su orden (p. ej. `gemini` o `minimax,gemini`).
 * Solo entran los proveedores con clave. Sin ninguno, responde 503 en cada llamada (nunca texto falso).
 */
export function buildTextProvider(order: string, env: NodeJS.ProcessEnv = process.env): AiTextProvider {
  const names = order
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean)

  const providers: AiTextProvider[] = []
  for (const name of names) {
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
        throw new AiUnavailableError('no hay clave de IA configurada para esta tarea')
      },
    }
  }
  return providers.length === 1 ? providers[0] : new FallbackTextProvider(providers)
}
