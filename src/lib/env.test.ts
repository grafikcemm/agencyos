import { describe, it, expect, vi, afterEach } from 'vitest'
import { checkEnv, notifyOps, guardCronEnv } from './env'

afterEach(() => {
  vi.restoreAllMocks()
  delete process.env.ALERT_WEBHOOK_URL
})

describe('checkEnv', () => {
  it('reports ok when all names are present', () => {
    const result = checkEnv(['A', 'B'], { A: 'x', B: 'y' })
    expect(result).toEqual({ ok: true, missing: [] })
  })

  it('lists every missing name, not just the first', () => {
    const result = checkEnv(['A', 'B', 'C'], { B: 'y' })
    expect(result.ok).toBe(false)
    expect(result.missing).toEqual(['A', 'C'])
  })

  it('treats blank / whitespace-only values as missing', () => {
    const result = checkEnv(['A', 'B'], { A: '', B: '   ' })
    expect(result.missing).toEqual(['A', 'B'])
  })
})

describe('notifyOps', () => {
  it('logs a structured line and does not call fetch when no webhook is set', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    await notifyOps({ source: 'daily-scan', level: 'error', message: 'boom' })

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[OPS-ALERT] ERROR source=daily-scan :: boom'),
      expect.anything(),
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('POSTs to ALERT_WEBHOOK_URL when configured', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    process.env.ALERT_WEBHOOK_URL = 'https://hooks.example.com/abc'
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('ok'))

    await notifyOps({ source: 'agent-tick', level: 'error', message: 'down' })

    expect(fetchSpy).toHaveBeenCalledOnce()
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://hooks.example.com/abc')
    expect(init?.method).toBe('POST')
  })

  it('never throws even if webhook delivery rejects', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    process.env.ALERT_WEBHOOK_URL = 'https://hooks.example.com/abc'
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))

    await expect(
      notifyOps({ source: 'x', level: 'error', message: 'y' }),
    ).resolves.toBeUndefined()
  })
})

describe('guardCronEnv', () => {
  it('returns null when all required vars are present', async () => {
    const result = await guardCronEnv('daily-scan', ['PATH'])
    expect(result).toBeNull()
  })

  it('returns a 500 Response naming the missing vars', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await guardCronEnv('daily-scan', [
      'DEFINITELY_MISSING_VAR_1',
      'DEFINITELY_MISSING_VAR_2',
    ])

    expect(result).not.toBeNull()
    expect(result!.status).toBe(500)
    const body = await result!.json()
    expect(body.error).toBe('missing_env')
    expect(body.missing).toEqual([
      'DEFINITELY_MISSING_VAR_1',
      'DEFINITELY_MISSING_VAR_2',
    ])
  })
})
