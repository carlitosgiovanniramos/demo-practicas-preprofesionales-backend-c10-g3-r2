import { AiUnavailableError, type AiTextProvider } from './ai-provider'

const DEFAULT_MODEL = 'MiniMax-M3'
const ENDPOINT = 'https://api.minimax.io/v1/chat/completions'
const TIMEOUT_MS = 15_000
const MAX_COMPLETION_TOKENS = 1024

interface MiniMaxResponse {
  choices?: { message?: { content?: string | null }; finish_reason?: string }[]
}

/**
 * Cliente de MiniMax (API compatible con OpenAI). Se apaga el razonamiento con `thinking: disabled`,
 * que MiniMax-M3 acepta: así no se pagan tokens de razonamiento para una respuesta corta.
 */
export class MiniMaxTextProvider implements AiTextProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = DEFAULT_MODEL,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async generateText(prompt: string): Promise<string> {
    let response: Response
    try {
      response = await this.fetchFn(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          thinking: { type: 'disabled' },
          max_completion_tokens: MAX_COMPLETION_TOKENS,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch {
      throw new AiUnavailableError('no se pudo contactar a MiniMax')
    }
    if (!response.ok) throw new AiUnavailableError(`MiniMax respondió ${response.status}`, response.status)

    const body = (await response.json()) as MiniMaxResponse
    const choice = body.choices?.[0]
    if (choice?.finish_reason === 'length') throw new AiUnavailableError('la respuesta de MiniMax quedó incompleta')
    const text = choice?.message?.content?.trim()
    if (!text) throw new AiUnavailableError('MiniMax no devolvió texto')
    return text
  }
}
