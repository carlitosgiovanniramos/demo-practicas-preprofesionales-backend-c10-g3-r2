/** Cada tarea tiene su propio proveedor: generar textos elaborados y clasificar (JSON corto). */
export const AI_GENERATION_PROVIDER = Symbol('AI_GENERATION_PROVIDER')
export const AI_CLASSIFICATION_PROVIDER = Symbol('AI_CLASSIFICATION_PROVIDER')

/** Puerto del proveedor de texto. El dominio depende de esta interfaz, no de un proveedor concreto. */
export interface AiTextProvider {
  generateText(prompt: string): Promise<string>
}

/**
 * El proveedor no está configurado o no respondió bien. `status` es el código HTTP del proveedor
 * cuando lo hay (429 o 403 suelen indicar cuota agotada); sin él, fue un fallo de red o de formato.
 */
export class AiUnavailableError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'AiUnavailableError'
  }
}
