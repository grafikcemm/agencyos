import { describe, it, expect, vi, beforeEach } from 'vitest'

// Faz 3 — GERÇEK Gmail inbound transport: history.list cursor + pagination +
// 404 full-sync recovery + advanceCursor. Fake HTTP; gerçek ağ SIFIR.

const accountRows: Array<Record<string, unknown>> = []
let updateError: { message: string } | null = null
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: () => {
      const filters: Array<(r: Record<string, unknown>) => boolean> = []
      let payload: Record<string, unknown> | null = null
      const api: Record<string, unknown> = {}
      Object.assign(api, {
        select: () => api,
        eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return api },
        update: (p: Record<string, unknown>) => { payload = p; return api },
        then: (res: (v: unknown) => unknown) => {
          if (updateError) return Promise.resolve({ data: null, error: updateError }).then(res)
          const m = accountRows.filter((r) => filters.every((f) => f(r)))
          if (payload) m.forEach((r) => Object.assign(r, payload))
          return Promise.resolve({ data: m, error: null }).then(res)
        },
      })
      return api
    },
  },
}))

import { createGmailInboundTransport, GMAIL_INGEST_MAX_PAGES } from './gmailInboundTransport'

const TOKEN = 'ya29.SECRET'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
function recordingFetch(handler: (url: string) => Response | Promise<Response>) {
  const calls: string[] = []
  const impl = (async (url: RequestInfo | URL) => {
    calls.push(String(url))
    return handler(String(url))
  }) as typeof fetch
  return { impl, calls }
}

function messageResponse(id: string, from: string, rfc: string) {
  return {
    id, threadId: `th-${id}`, internalDate: '1700000000000', snippet: 's',
    payload: {
      headers: [
        { name: 'From', value: from },
        { name: 'Subject', value: 'Re: teklif' },
        { name: 'In-Reply-To', value: rfc },
      ],
      parts: [
        { mimeType: 'multipart/alternative', parts: [
          { mimeType: 'text/html', body: { data: 'aHRtbA' } },
          { mimeType: 'text/plain', body: { data: Buffer.from('gövde metni').toString('base64url') } },
        ] },
      ],
    },
  }
}

beforeEach(() => {
  accountRows.length = 0
  updateError = null
})

describe('incremental sync (history.list + cursor)', () => {
  it('history messagesAdded → messages.get; nested text/plain çözülür; From başlığı', async () => {
    const { impl, calls } = recordingFetch((url) => {
      if (url.includes('/history?')) {
        return jsonResponse(200, {
          history: [{ messagesAdded: [{ message: { id: 'm1', labelIds: ['INBOX'] } }] }],
          historyId: '9002',
        })
      }
      return jsonResponse(200, messageResponse('m1', 'musteri@x.com', '<rfc-1>'))
    })
    const t = createGmailInboundTransport({ id: 'acc-1', lastHistoryId: '9000' }, TOKEN, impl)
    const batch = await t.listInbound()
    expect(batch.messages).toHaveLength(1)
    expect(batch.messages[0]).toMatchObject({ fromAddress: 'musteri@x.com', inReplyTo: '<rfc-1>' })
    expect(batch.messages[0].bodyText).toBe('gövde metni')
    expect(batch.nextHistoryId).toBe('9002')
    expect(calls.some((c) => c.includes('startHistoryId=9000'))).toBe(true)
    expect(calls.some((c) => c.includes('Bearer') === false)).toBe(true) // Bearer header'da, url'de değil
  })

  it('history pagination: iki sayfa birleşir, son historyId cursor olur', async () => {
    const { impl } = recordingFetch((url) => {
      if (url.includes('/history?')) {
        if (!url.includes('pageToken')) {
          return jsonResponse(200, {
            history: [{ messagesAdded: [{ message: { id: 'm1', labelIds: ['INBOX'] } }] }],
            nextPageToken: 'p2', historyId: '9001',
          })
        }
        return jsonResponse(200, {
          history: [{ messagesAdded: [{ message: { id: 'm2', labelIds: ['INBOX'] } }] }],
          historyId: '9005',
        })
      }
      const id = url.match(/messages\/(m\d)/)?.[1] ?? 'm?'
      return jsonResponse(200, messageResponse(id, 'a@b.com', '<rfc>'))
    })
    const t = createGmailInboundTransport({ id: 'acc-1', lastHistoryId: '9000' }, TOKEN, impl)
    const batch = await t.listInbound()
    expect(batch.messages).toHaveLength(2)
    expect(batch.nextHistoryId).toBe('9005')
  })

  it('INBOX olmayan messagesAdded atlanır', async () => {
    const { impl } = recordingFetch((url) => {
      if (url.includes('/history?')) {
        return jsonResponse(200, {
          history: [{ messagesAdded: [{ message: { id: 'sent1', labelIds: ['SENT'] } }] }],
          historyId: '9003',
        })
      }
      return jsonResponse(200, messageResponse('x', 'a@b.com', '<r>'))
    })
    const t = createGmailInboundTransport({ id: 'acc-1', lastHistoryId: '9000' }, TOKEN, impl)
    const batch = await t.listInbound()
    expect(batch.messages).toHaveLength(0)
    expect(batch.nextHistoryId).toBe('9003')
  })

  it('history 404 (cursor expired) → KONTROLLÜ full-sync recovery', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { impl, calls } = recordingFetch((url) => {
      if (url.includes('/history?')) return jsonResponse(404, { error: { status: 'NOT_FOUND' } })
      if (url.includes('/messages?')) return jsonResponse(200, { messages: [{ id: 'fm1' }] })
      if (url.includes('/profile')) return jsonResponse(200, { historyId: '9999' })
      return jsonResponse(200, messageResponse('fm1', 'a@b.com', '<r>'))
    })
    const t = createGmailInboundTransport({ id: 'acc-1', lastHistoryId: '1' }, TOKEN, impl)
    const batch = await t.listInbound()
    expect(batch.messages).toHaveLength(1)
    expect(batch.nextHistoryId).toBe('9999') // profil historyId
    expect(calls.some((c) => c.includes('/profile'))).toBe(true)
    warnSpy.mockRestore()
  })

  it('history non-404 hata → THROW (sessiz düşüş yok)', async () => {
    const { impl } = recordingFetch(() => jsonResponse(500, { error: { status: 'INTERNAL' } }))
    const t = createGmailInboundTransport({ id: 'acc-1', lastHistoryId: '9000' }, TOKEN, impl)
    await expect(t.listInbound()).rejects.toThrow(/history 500/)
  })
})

describe('full sync (cursor yok = ilk sync)', () => {
  it('messages.list pagination + profil cursor', async () => {
    const { impl } = recordingFetch((url) => {
      if (url.includes('/messages?')) {
        if (!url.includes('pageToken')) return jsonResponse(200, { messages: [{ id: 'a' }], nextPageToken: 'p2' })
        return jsonResponse(200, { messages: [{ id: 'b' }] })
      }
      if (url.includes('/profile')) return jsonResponse(200, { historyId: '5000' })
      const id = url.match(/messages\/(\w)/)?.[1] ?? '?'
      return jsonResponse(200, messageResponse(id, 'a@b.com', '<r>'))
    })
    const t = createGmailInboundTransport({ id: 'acc-1', lastHistoryId: null }, TOKEN, impl)
    const batch = await t.listInbound()
    expect(batch.messages).toHaveLength(2)
    expect(batch.nextHistoryId).toBe('5000')
  })

  it('full-sync list hatası → THROW', async () => {
    const { impl } = recordingFetch((url) =>
      url.includes('/messages?') ? jsonResponse(503, {}) : jsonResponse(200, {}),
    )
    const t = createGmailInboundTransport({ id: 'acc-1', lastHistoryId: null }, TOKEN, impl)
    await expect(t.listInbound()).rejects.toThrow(/full-sync list 503/)
  })
})

describe('mesaj ayrıştırma dalları', () => {
  it('text/plain YOK → snippet fallback; internalDate YOK → internalDateMs null', async () => {
    const { impl } = recordingFetch((url) => {
      if (url.includes('/history?')) {
        return jsonResponse(200, { history: [{ messagesAdded: [{ message: { id: 'm1', labelIds: ['INBOX'] } }] }], historyId: '9002' })
      }
      return jsonResponse(200, {
        id: 'm1', threadId: null, snippet: 'kısa özet',
        payload: { headers: [{ name: 'From', value: 'a@b.com' }], parts: [{ mimeType: 'text/html', body: { data: 'aHRtbA' } }] },
      })
    })
    const t = createGmailInboundTransport({ id: 'acc-1', lastHistoryId: '9000' }, TOKEN, impl)
    const batch = await t.listInbound()
    expect(batch.messages[0].bodyText).toBe('kısa özet')
    expect(batch.messages[0].internalDateMs).toBeNull()
    expect(batch.messages[0].threadId).toBeNull()
  })

  it('messages.get hatası → THROW', async () => {
    const { impl } = recordingFetch((url) =>
      url.includes('/history?')
        ? jsonResponse(200, { history: [{ messagesAdded: [{ message: { id: 'm1', labelIds: ['INBOX'] } }] }], historyId: '1' })
        : jsonResponse(404, {}),
    )
    const t = createGmailInboundTransport({ id: 'acc-1', lastHistoryId: '9000' }, TOKEN, impl)
    await expect(t.listInbound()).rejects.toThrow(/gmail get 404/)
  })

  it('full-sync profil hatası → nextHistoryId null (cursor ilerlemez)', async () => {
    const { impl } = recordingFetch((url) => {
      if (url.includes('/messages?')) return jsonResponse(200, { messages: [{ id: 'a' }] })
      if (url.includes('/profile')) return jsonResponse(500, {})
      return jsonResponse(200, messageResponse('a', 'a@b.com', '<r>'))
    })
    const t = createGmailInboundTransport({ id: 'acc-1', lastHistoryId: null }, TOKEN, impl)
    const batch = await t.listInbound()
    expect(batch.nextHistoryId).toBeNull()
  })

  it('history message id yok → atlanır (boş batch)', async () => {
    const { impl } = recordingFetch(() =>
      jsonResponse(200, { history: [{ messagesAdded: [{ message: { labelIds: ['INBOX'] } }] }], historyId: '9002' }),
    )
    const t = createGmailInboundTransport({ id: 'acc-1', lastHistoryId: '9000' }, TOKEN, impl)
    const batch = await t.listInbound()
    expect(batch.messages).toHaveLength(0)
  })

  it('labelIds YOK (undefined) → INBOX varsay (dahil edilir)', async () => {
    const { impl } = recordingFetch((url) =>
      url.includes('/history?')
        ? jsonResponse(200, { history: [{ messagesAdded: [{ message: { id: 'm1' } }] }], historyId: '9002' })
        : jsonResponse(200, messageResponse('m1', 'a@b.com', '<r>')),
    )
    const t = createGmailInboundTransport({ id: 'acc-1', lastHistoryId: '9000' }, TOKEN, impl)
    const batch = await t.listInbound()
    expect(batch.messages).toHaveLength(1)
  })

  it('doğrudan payload.body.data (parts yok) → gövde çözülür', async () => {
    const { impl } = recordingFetch((url) =>
      url.includes('/history?')
        ? jsonResponse(200, { history: [{ messagesAdded: [{ message: { id: 'm1', labelIds: ['INBOX'] } }] }], historyId: '9002' })
        : jsonResponse(200, {
            id: 'm1', internalDate: '1700000000000',
            payload: { headers: [{ name: 'From', value: 'a@b.com' }], body: { data: Buffer.from('düz gövde').toString('base64url') } },
          }),
    )
    const t = createGmailInboundTransport({ id: 'acc-1', lastHistoryId: '9000' }, TOKEN, impl)
    const batch = await t.listInbound()
    expect(batch.messages[0].bodyText).toBe('düz gövde')
  })

  it('full-sync: id\'siz mesaj referansı atlanır', async () => {
    const { impl } = recordingFetch((url) => {
      if (url.includes('/messages?')) return jsonResponse(200, { messages: [{}, { id: 'a' }] })
      if (url.includes('/profile')) return jsonResponse(200, { historyId: '5000' })
      return jsonResponse(200, messageResponse('a', 'a@b.com', '<r>'))
    })
    const t = createGmailInboundTransport({ id: 'acc-1', lastHistoryId: null }, TOKEN, impl)
    const batch = await t.listInbound()
    expect(batch.messages).toHaveLength(1)
  })

  it('full-sync profil historyId undefined → nextHistoryId null', async () => {
    const { impl } = recordingFetch((url) => {
      if (url.includes('/messages?')) return jsonResponse(200, { messages: [{ id: 'a' }] })
      if (url.includes('/profile')) return jsonResponse(200, {})
      return jsonResponse(200, messageResponse('a', 'a@b.com', '<r>'))
    })
    const t = createGmailInboundTransport({ id: 'acc-1', lastHistoryId: null }, TOKEN, impl)
    const batch = await t.listInbound()
    expect(batch.nextHistoryId).toBeNull()
  })
})

describe('advanceCursor', () => {
  it('last_history_id yazar', async () => {
    accountRows.push({ id: 'acc-1', last_history_id: '1' })
    const { impl } = recordingFetch(() => jsonResponse(200, {}))
    const t = createGmailInboundTransport({ id: 'acc-1', lastHistoryId: '1' }, TOKEN, impl)
    await t.advanceCursor!('9500')
    expect(accountRows[0].last_history_id).toBe('9500')
  })

  it('maxMessages cap: sınıra ulaşınca pagination durur', async () => {
    const { impl } = recordingFetch((url) => {
      if (url.includes('/messages?')) return jsonResponse(200, { messages: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], nextPageToken: 'p2' })
      if (url.includes('/profile')) return jsonResponse(200, { historyId: '5000' })
      const id = url.match(/messages\/(\w)/)?.[1] ?? '?'
      return jsonResponse(200, messageResponse(id, 'a@b.com', '<r>'))
    })
    const t = createGmailInboundTransport({ id: 'acc-1', lastHistoryId: null }, TOKEN, impl, { maxMessages: 2 })
    const batch = await t.listInbound()
    expect(batch.messages).toHaveLength(2) // cap
  })

  it('maxPages cap: sayfa sınırına ulaşınca durur (runaway koruması)', async () => {
    const { impl } = recordingFetch((url) => {
      if (url.includes('/history?')) {
        return jsonResponse(200, { history: [], nextPageToken: 'sonsuz', historyId: '9001' })
      }
      return jsonResponse(200, {})
    })
    const t = createGmailInboundTransport({ id: 'acc-1', lastHistoryId: '9000' }, TOKEN, impl, { maxPages: 2 })
    const batch = await t.listInbound()
    expect(batch.messages).toHaveLength(0) // sonsuz pagination durduruldu
  })

  it('decodeBody: text/plain YOK + snippet YOK → boş string', async () => {
    const { impl } = recordingFetch((url) =>
      url.includes('/history?')
        ? jsonResponse(200, { history: [{ messagesAdded: [{ message: { id: 'm1', labelIds: ['INBOX'] } }] }], historyId: '9002' })
        : jsonResponse(200, { id: 'm1', payload: { headers: [{ name: 'From', value: 'a@b.com' }] } }),
    )
    const t = createGmailInboundTransport({ id: 'acc-1', lastHistoryId: '9000' }, TOKEN, impl)
    const batch = await t.listInbound()
    expect(batch.messages[0].bodyText).toBe('')
  })

  it('cursor yazımı DB hatası → THROW (sessiz düşüş yok)', async () => {
    updateError = { message: 'db down' }
    const { impl } = recordingFetch(() => jsonResponse(200, {}))
    const t = createGmailInboundTransport({ id: 'acc-1', lastHistoryId: '1' }, TOKEN, impl)
    await expect(t.advanceCursor!('9500')).rejects.toThrow(/cursor yazılamadı/)
  })

  it('MAX_PAGES sınırı tanımlı (runaway koruması)', () => {
    expect(GMAIL_INGEST_MAX_PAGES).toBeGreaterThan(0)
  })
})
