import { AiUnavailableError, type AiTextProvider } from './ai-provider'

const DEFAULT_MODEL = 'gemini-2.5-flash-lite'
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'
const TIMEOUT_MS = 15_000

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
          generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
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
