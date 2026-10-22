import { AiUnavailableError, type AiTextProvider } from './ai-provider'

/**
 * Prueba los proveedores en orden. Si uno falla (cuota agotada, red, respuesta incompleta), pasa al
 * siguiente. Si todos fallan, lanza el último error. Así cambiar de proveedor no toca el dominio.
 */
export class FallbackTextProvider implements AiTextProvider {
  constructor(private readonly providers: AiTextProvider[]) {}

  async generateText(prompt: string): Promise<string> {
    let lastError: unknown = new AiUnavailableError('no hay proveedores de IA configurados')
    for (const provider of this.providers) {
      try {
        return await provider.generateText(prompt)
      } catch (error) {
        if (!(error instanceof AiUnavailableError)) throw error
        lastError = error
      }
    }
    throw lastError
  }
}
