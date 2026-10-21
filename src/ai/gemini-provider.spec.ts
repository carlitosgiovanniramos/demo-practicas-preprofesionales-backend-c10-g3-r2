import { describe, expect, it, vi } from 'vitest'
import { AiUnavailableError } from './ai-provider'
import { GeminiTextProvider } from './gemini-provider'

const okResponse = (text: string) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 })

describe('GeminiTextProvider', () => {
  it('envía la clave en el header y el prompt en el cuerpo, y devuelve el texto', async () => {
    const fetchFn = vi.fn(async () => okResponse('Resumen listo'))
    const provider = new GeminiTextProvider('clave-demo', 'gemini-2.5-flash-lite', fetchFn as unknown as typeof fetch)

    const text = await provider.generateText('hola')

    expect(text).toBe('Resumen listo')
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent',
    )
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('clave-demo')
    expect(JSON.parse(init.body as string).contents[0].parts[0].text).toBe('hola')
  })

  it('une varias partes de texto de la respuesta', async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'a' }, { text: 'b' }] } }] }), {
          status: 200,
        }),
    )
    const provider = new GeminiTextProvider('k', undefined, fetchFn as unknown as typeof fetch)
    await expect(provider.generateText('x')).resolves.toBe('ab')
  })

  it('lanza AiUnavailableError si la API responde con error', async () => {
    const fetchFn = vi.fn(async () => new Response('quota', { status: 429 }))
    const provider = new GeminiTextProvider('k', undefined, fetchFn as unknown as typeof fetch)
    await expect(provider.generateText('x')).rejects.toThrow(AiUnavailableError)
  })

  it('lanza AiUnavailableError si la red falla', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    const provider = new GeminiTextProvider('k', undefined, fetchFn as unknown as typeof fetch)
    await expect(provider.generateText('x')).rejects.toThrow(AiUnavailableError)
  })

  it('no devuelve un texto cortado por límite de tokens', async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ candidates: [{ content: { parts: [{ text: 'con un porcentaje de' }] }, finishReason: 'MAX_TOKENS' }] }),
          { status: 200 },
        ),
    )
    const provider = new GeminiTextProvider('k', undefined, fetchFn as unknown as typeof fetch)
    await expect(provider.generateText('x')).rejects.toThrow('quedó incompleta')
  })

  it('lanza AiUnavailableError si la respuesta no trae texto', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ candidates: [] }), { status: 200 }))
    const provider = new GeminiTextProvider('k', undefined, fetchFn as unknown as typeof fetch)
    await expect(provider.generateText('x')).rejects.toThrow('Gemini no devolvió texto')
  })
})
