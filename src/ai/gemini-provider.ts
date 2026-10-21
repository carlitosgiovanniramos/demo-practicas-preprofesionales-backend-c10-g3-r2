import { AiUnavailableError, type AiTextProvider } from './ai-provider'

const DEFAULT_MODEL = 'gemini-2.5-flash-lite'
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'
const TIMEOUT_MS = 15_000
// Las plantillas piden textos cortos (≈100 palabras). El límite ya cubre eso sin razonamiento.
const MAX_OUTPUT_TOKENS = 400

/**
 * Configuración de generación por familia de modelo. Los modelos con razonamiento consumen el
 * presupuesto de salida (y se cobran), así que se desactiva o se reduce según la familia.
 */
export function generationConfigFor(model: string): GenerationConfig {
  const base: GenerationConfig = { temperature: 0.3, maxOutputTokens: MAX_OUTPUT_TOKENS }
  if (model.startsWith('gemini-2.5')) return { ...base, thinkingConfig: { thinkingBudget: 0 } }
  if (model.startsWith('gemini-3')) return { ...base, thinkingConfig: { thinkingLevel: 'low' } }
  return base
}

interface GenerationConfig {
  temperature: number
  maxOutputTokens: number
  thinkingConfig?: { thinkingBudget?: number; thinkingLevel?: string }
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]
}

/** Cliente REST mínimo de Gemini (sin SDK): una llamada `generateContent` por prompt. */
export class GeminiTextProvider implements AiTextProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = DEFAULT_MODEL,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async generateText(prompt: string): Promise<string> {
    let response: Response
    try {
      response = await this.fetchFn(`${ENDPOINT}/${this.model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: generationConfigFor(this.model),
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch {
      throw new AiUnavailableError('no se pudo contactar a Gemini')
    }
    if (!response.ok) throw new AiUnavailableError(`Gemini respondió ${response.status}`)

    const body = (await response.json()) as GeminiResponse
    const candidate = body.candidates?.[0]
    // Un texto cortado por límite de tokens no es una respuesta válida: se trata como fallo.
    if (candidate?.finishReason === 'MAX_TOKENS') throw new AiUnavailableError('la respuesta de Gemini quedó incompleta')
    const text = candidate?.content?.parts?.map((p) => p.text ?? '').join('').trim()
    if (!text) throw new AiUnavailableError('Gemini no devolvió texto')
    return text
  }
}
