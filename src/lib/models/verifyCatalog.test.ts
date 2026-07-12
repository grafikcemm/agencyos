import { describe, it, expect } from 'vitest'
import { fetchLiveCatalog } from './verify'

// fetchLiveCatalog: canlı katalog parse (per-token → $/M) + hata + timeout sinyali.

function fakeFetch(response: Partial<Response>): typeof fetch {
  return (async () => response as Response) as typeof fetch
}

describe('fetchLiveCatalog', () => {
  it('per-token fiyatları $/M\'e çevirir', async () => {
    const catalog = await fetchLiveCatalog(
      fakeFetch({
        ok: true,
        json: async () => ({
          data: [
            { id: 'x/model-a', pricing: { prompt: '0.0000005', completion: '0.000002' } },
            { id: 'x/model-b', pricing: { prompt: 'not-a-number' } },
            { pricing: { prompt: '0.000001' } }, // id'siz satır atlanır
          ],
        }),
      })
    )
    expect(catalog.get('x/model-a')?.promptPerM).toBeCloseTo(0.5)
    expect(catalog.get('x/model-a')?.completionPerM).toBeCloseTo(2.0)
    expect(Number.isNaN(catalog.get('x/model-b')?.promptPerM)).toBe(true)
    expect(catalog.size).toBe(2)
  })

  it('non-OK yanıt → açıklayıcı throw', async () => {
    await expect(fetchLiveCatalog(fakeFetch({ ok: false, status: 503 }))).rejects.toThrow('HTTP 503')
  })

  it('fetch\'e abort signal geçirilir (asılı istek süresiz bekletemez)', async () => {
    let receivedSignal: AbortSignal | undefined
    const spyFetch = (async (_url: unknown, init?: RequestInit) => {
      receivedSignal = init?.signal ?? undefined
      return { ok: true, json: async () => ({ data: [] }) } as Response
    }) as typeof fetch
    await fetchLiveCatalog(spyFetch)
    expect(receivedSignal).toBeDefined()
  })
})
