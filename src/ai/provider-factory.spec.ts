import { describe, expect, it, vi } from 'vitest'
import { AiUnavailableError, type AiTextProvider } from './ai-provider'
import { FallbackTextProvider } from './fallback-provider'
import { DEFAULT_CLASSIFICATION_ORDER, DEFAULT_GENERATION_ORDER, buildTextProvider } from './provider-factory'
import { MiniMaxTextProvider } from './minimax-provider'

const okText = (text: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content: text }, finish_reason: 'stop' }] }), { status: 200 })

describe('MiniMaxTextProvider', () => {
  it('envía la clave Bearer, desactiva el razonamiento y devuelve el texto', async () => {
    const fetchFn = vi.fn(async () => okText('Plan listo'))
    const provider = new MiniMaxTextProvider('clave', 'MiniMax-M3', fetchFn as unknown as typeof fetch)

    await expect(provider.generateText('hola')).resolves.toBe('Plan listo')

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.minimax.io/v1/chat/completions')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer clave')
    const body = JSON.parse(init.body as string)
    expect(body.thinking).toEqual({ type: 'disabled' })
    expect(body.messages).toEqual([{ role: 'user', content: 'hola' }])
  })

  it('expone el código HTTP cuando la cuota se agota (429)', async () => {
    const fetchFn = vi.fn(async () => new Response('quota', { status: 429 }))
    const provider = new MiniMaxTextProvider('k', undefined, fetchFn as unknown as typeof fetch)
    await expect(provider.generateText('x')).rejects.toMatchObject({ status: 429 })
  })

  it('no devuelve un texto cortado por límite de tokens', async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: 'a med' }, finish_reason: 'length' }] }), {
          status: 200,
        }),
    )
    const provider = new MiniMaxTextProvider('k', undefined, fetchFn as unknown as typeof fetch)
    await expect(provider.generateText('x')).rejects.toThrow('quedó incompleta')
  })
})

describe('buildTextProvider', () => {
  it('sin clave para la tarea responde 503 en cada llamada', async () => {
    await expect(buildTextProvider('gemini', {}).generateText('x')).rejects.toBeInstanceOf(AiUnavailableError)
  })

  it('con una sola clave usa ese proveedor directamente', () => {
    expect(buildTextProvider('gemini', { GEMINI_API_KEY: 'g' })).not.toBeInstanceOf(FallbackTextProvider)
  })

  it('con dos proveedores en el orden crea un respaldo entre ellos', () => {
    const provider = buildTextProvider('gemini,minimax', { GEMINI_API_KEY: 'g', MINIMAX_API_KEY: 'm' })
    expect(provider).toBeInstanceOf(FallbackTextProvider)
  })

  it('ignora un proveedor sin clave aunque aparezca en el orden', () => {
    expect(buildTextProvider('minimax,gemini', { GEMINI_API_KEY: 'g' })).not.toBeInstanceOf(FallbackTextProvider)
  })

  it('los valores por defecto separan generación (Gemini) de clasificación (MiniMax)', () => {
    expect(DEFAULT_GENERATION_ORDER).toBe('gemini')
    expect(DEFAULT_CLASSIFICATION_ORDER).toBe('minimax')
  })
})

describe('FallbackTextProvider', () => {
  const failing = (status?: number): AiTextProvider => ({
    generateText: vi.fn(async () => {
      throw new AiUnavailableError('caída', status)
    }),
  })
  const working = (text: string): AiTextProvider => ({ generateText: vi.fn(async () => text) })

  it('cambia al siguiente proveedor cuando el primero agota su cuota', async () => {
    const provider = new FallbackTextProvider([failing(429), working('desde minimax')])
    await expect(provider.generateText('x')).resolves.toBe('desde minimax')
  })

  it('usa el primero mientras funcione, sin tocar el respaldo', async () => {
    const backup = working('respaldo')
    const provider = new FallbackTextProvider([working('principal'), backup])
    await expect(provider.generateText('x')).resolves.toBe('principal')
    expect(backup.generateText).not.toHaveBeenCalled()
  })

  it('si todos fallan lanza el último error', async () => {
    const provider = new FallbackTextProvider([failing(429), failing(403)])
    await expect(provider.generateText('x')).rejects.toMatchObject({ status: 403 })
  })
})
