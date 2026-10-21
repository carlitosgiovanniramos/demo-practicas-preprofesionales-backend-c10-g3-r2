export const AI_TEXT_PROVIDER = Symbol('AI_TEXT_PROVIDER')

/** Puerto del proveedor de texto. El dominio depende de esta interfaz, no de Gemini. */
export interface AiTextProvider {
  generateText(prompt: string): Promise<string>
}

/** El proveedor no está configurado o no respondió bien. El controlador lo traduce a 503. */
export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AiUnavailableError'
  }
}
