import { describe, it, expect, vi } from 'vitest'
import {
  ALL_OUTREACH_KEYS,
  OutreachProviderError,
  createFakeOutreachProvider,
  createGmailDirectProvider,
  createInstantlyProvider,
  getOutreachProvider,
  guardedSend,
  listOutreachHealth,
  mapAttemptState,
  mapEventType,
  resolveOutreachProvider,
} from './outreach'
import type { OutreachMessage } from './outreach'

// RT-A5 — OutreachProvider katmanı.
//
// GERÇEK GÖNDERİM SIFIR: Instantly'ye `fetchImpl`, Gmail'e `sendImpl` enjekte
// edilir. "Kapalıyken ağa çıkmaz" testleri, bir kaçağın sessizce olmadığını
// kanıtlar.

const MSG: OutreachMessage = {
  localId: 'om-1',
  recipient: { localId: 'lead-1', email: 'deniz@sirket.com', firstName: 'Deniz', companyName: 'Sirket' },
  subject: 'Kısa bir gözlem',
  body: 'Merhaba Deniz, sitenizde bir şey dikkatimi çekti.',
  sequenceStep: 0,
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const INSTANTLY_ON = {
  INSTANTLY_ENABLED: 'true',
  INSTANTLY_API_KEY: 'ins_GIZLI',
  INSTANTLY_CAMPAIGN_ID: 'camp-1',
}

// ─────────────────────────── sözleşme bütünlüğü ──────────────────────────────

describe('sözleşme — üç sağlayıcı da dokuz metodu uygular', () => {
  it('metot kümesi birebir aynı', () => {
    const methods = ['health', 'capabilities', 'ensureLead', 'enqueue', 'send', 'status', 'pollEvents', 'reconcileUnknown', 'suppress']
    for (const key of ALL_OUTREACH_KEYS) {
      const p = getOutreachProvider(key, { env: {} })
      for (const m of methods) {
        expect(typeof (p as unknown as Record<string, unknown>)[m], `${key}.${m}`).toBe('function')
      }
      expect(p.key).toBe(key)
    }
  })

  it('bilinmeyen sağlayıcı sessizce fake`e düşmez', () => {
    expect(() => getOutreachProvider('sendgrid' as never)).toThrow(OutreachProviderError)
  })
})

// ──────────────────────────────── seçim ──────────────────────────────────────

describe('sağlayıcı seçimi', () => {
  it('hiçbir şey açık değilken FAKE seçilir ve gerçek mail çıkmaz', () => {
    const c = resolveOutreachProvider({ env: {} })
    expect(c.key).toBe('fake')
    expect(c.canSendReal).toBe(false)
    // Sebep hem Instantly hem Gmail için yazılı olmalı.
    expect(c.reason).toContain('INSTANTLY_ENABLED kapalı')
    expect(c.reason).toContain('GMAIL_SEND_ENABLED kapalı')
  })

  it('Instantly açıksa o seçilir', () => {
    expect(resolveOutreachProvider({ env: INSTANTLY_ON }).key).toBe('instantly')
  })

  it('Instantly kapalı ama Gmail açıksa Gmail seçilir', () => {
    expect(resolveOutreachProvider({ env: { GMAIL_SEND_ENABLED: 'true' } }).key).toBe('gmail')
  })

  it('Instantly açık ama yapılandırılmamışsa GERÇEK gönderim sayılmaz', () => {
    const c = resolveOutreachProvider({ env: { INSTANTLY_ENABLED: 'true' } })
    expect(c.key).toBe('fake')
  })

  it('sağlık tablosu anahtar DEĞERİ sızdırmaz', () => {
    const dump = JSON.stringify(listOutreachHealth({ env: INSTANTLY_ON }))
    expect(dump).not.toContain('GIZLI')
  })
})

// ──────────────────────────────── Instantly ──────────────────────────────────

describe('Instantly — default kapalı', () => {
  it('KAPALIYKEN hiçbir metot ağa çıkmaz', async () => {
    const fetchImpl = vi.fn()
    const p = createInstantlyProvider({ env: { INSTANTLY_API_KEY: 'k', INSTANTLY_CAMPAIGN_ID: 'c' }, fetchImpl: fetchImpl as unknown as typeof fetch })
    for (const call of [
      () => p.send(MSG),
      () => p.enqueue(MSG),
      () => p.ensureLead(MSG.recipient),
      () => p.status('om-1'),
      () => p.pollEvents(new Date()),
      () => p.reconcileUnknown('om-1'),
      () => p.suppress('a@b.com', 'opt_out'),
    ]) {
      await expect(call()).rejects.toMatchObject({ code: 'disabled' })
    }
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('açık ama yapılandırılmamışsa not_configured', async () => {
    const p = createInstantlyProvider({ env: { INSTANTLY_ENABLED: 'true' }, fetchImpl: vi.fn() as unknown as typeof fetch })
    await expect(p.send(MSG)).rejects.toMatchObject({ code: 'not_configured' })
  })

  it('diziyi Instantly yürütür — `send` SENT DÖNMEZ', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: 'lead-remote-1' }))
    const p = createInstantlyProvider({ env: INSTANTLY_ON, fetchImpl: fetchImpl as unknown as typeof fetch })
    const r = await p.send(MSG)
    // Gerçek gönderim Instantly'nin takviminde; burada `sent` demek olmayan
    // bir gönderimi var göstermek olurdu.
    expect(r.state).toBe('synced')
    expect(r.reallySent).toBe(false)
    expect(r.remoteId).toBe('lead-remote-1')
  })

  it('gönderimde idempotency anahtarı taşınır', async () => {
    const fetchImpl = vi.fn(async (_u: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)['Idempotency-Key']).toBe('agencyos-om-1')
      return jsonResponse({ id: 'r1' })
    })
    await createInstantlyProvider({ env: INSTANTLY_ON, fetchImpl: fetchImpl as unknown as typeof fetch }).send(MSG)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

describe('Instantly — belirsizlik ve otomatik tekrar YASAĞI', () => {
  const withFetch = (impl: unknown) =>
    createInstantlyProvider({ env: INSTANTLY_ON, fetchImpl: impl as typeof fetch, timeoutMs: 20 })

  it('zaman aşımı → provider_unknown, İKİNCİ İSTEK YOK', async () => {
    const fetchImpl = vi.fn((_u: string, init?: RequestInit) =>
      new Promise((_r, rej) => {
        init?.signal?.addEventListener('abort', () => {
          const e = new Error('aborted')
          e.name = 'AbortError'
          rej(e)
        })
      }),
    )
    const r = await withFetch(fetchImpl).send(MSG)
    expect(r.state).toBe('provider_unknown')
    expect(r.ambiguityReason).toBe('timeout')
    expect(fetchImpl).toHaveBeenCalledTimes(1) // kör retry YOK
  })

  it('429 ve 5xx de provider_unknown üretir', async () => {
    for (const [status, reason] of [[429, 'rate_limited'], [500, 'server_error'], [503, 'server_error']] as const) {
      const r = await withFetch(async () => new Response('x', { status })).send(MSG)
      expect(r.state).toBe('provider_unknown')
      expect(r.ambiguityReason).toBe(reason)
    }
  })

  it('4xx KESİN rettir — provider_unknown DEĞİL, hata', async () => {
    // Belirsiz saymak, gerçekte hiç işlenmemiş isteği "gitmiş olabilir"
    // kuyruğuna sokup uzlaştırma gürültüsü yaratırdı.
    await expect(withFetch(async () => new Response('bad', { status: 422 })).send(MSG))
      .rejects.toMatchObject({ code: 'rejected', ambiguous: false })
  })

  it('HAM hata gövdesi mesaja sızmaz', async () => {
    try {
      await withFetch(async () => new Response('key ins_GIZLI invalid', { status: 401 })).send(MSG)
      throw new Error('reddetmeliydi')
    } catch (e) {
      expect((e as Error).message).not.toContain('GIZLI')
    }
  })

  it('uzlaştırma: kayıt bulunursa confirmed_sent', async () => {
    const r = await withFetch(async () => jsonResponse({ items: [{ id: 'remote-9' }] })).reconcileUnknown('om-1')
    expect(r).toEqual({ outcome: 'confirmed_sent', remoteId: 'remote-9' })
  })

  it('uzlaştırma: kayıt YOKSA "gönderilmedi" DEMEZ', async () => {
    const r = await withFetch(async () => jsonResponse({ items: [] })).reconcileUnknown('om-1')
    expect(r.outcome).toBe('still_unknown')
  })

  it('uzlaştırma sorgusu düşerse durum bilinmez KALIR', async () => {
    const r = await withFetch(async () => new Response('', { status: 500 })).reconcileUnknown('om-1')
    expect(r.outcome).toBe('still_unknown')
  })
})

describe('Instantly — olaylar idempotent', () => {
  const withFetch = (impl: unknown) => createInstantlyProvider({ env: INSTANTLY_ON, fetchImpl: impl as typeof fetch })

  it('olay kimliği + kapalı küme tip; HAM gövde saklanmaz', async () => {
    const p = withFetch(async () =>
      jsonResponse({
        items: [
          { id: 'ev-1', event_type: 'email_sent', timestamp: '2026-07-31T09:00:00Z', custom_variables: { agencyos_local_id: 'om-1' }, body: 'GIZLI-METIN' },
          { id: 'ev-2', event_type: 'reply_received', custom_variables: { agencyos_local_id: 'om-1' } },
        ],
      }),
    )
    const evs = await p.pollEvents(new Date('2026-07-30T00:00:00Z'))
    expect(evs.map((e) => e.eventType)).toEqual(['sent', 'reply'])
    expect(evs[0].remoteEventId).toBe('ev-1')
    expect(evs[0].payloadHash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(evs)).not.toContain('GIZLI-METIN')
  })

  it('kimliksiz ya da BİLİNMEYEN tipli olay ATILIR (uydurulmaz)', async () => {
    const p = withFetch(async () =>
      jsonResponse({ items: [{ event_type: 'email_sent' }, { id: 'ev-3', event_type: 'yeni_olay_tipi' }, null, 'x'] }),
    )
    expect(await p.pollEvents(new Date())).toEqual([])
  })

  it('olay listesi dizi değilse bad_response', async () => {
    await expect(withFetch(async () => jsonResponse({ items: {} })).pollEvents(new Date()))
      .rejects.toMatchObject({ code: 'bad_response' })
  })

  it('olay tipi eşlemesi kapalı küme', () => {
    expect(mapEventType('email_bounced')).toBe('bounce')
    expect(mapEventType('lead_unsubscribed')).toBe('opt_out')
    expect(mapEventType('spam_complaint')).toBe('complaint')
    expect(mapEventType('bilinmeyen')).toBeNull()
    expect(mapEventType(undefined)).toBeNull()
  })
})

// ─────────────────────────────── GmailDirect ─────────────────────────────────

describe('GmailDirect — mevcut çekirdeğe bağlanır', () => {
  it('ONAYSIZ gönderim çekirdeğe HİÇ ulaşmaz', async () => {
    const sendImpl = vi.fn()
    const p = createGmailDirectProvider({ env: {}, sendImpl: sendImpl as never })
    await expect(p.send(MSG)).rejects.toMatchObject({ code: 'not_eligible' })
    expect(sendImpl).not.toHaveBeenCalled()
  })

  it('dry-run başarı GERÇEK gönderim sayılmaz', async () => {
    const p = createGmailDirectProvider({
      env: {},
      sendImpl: (async () => ({ ok: true, dryRun: true, gmailMessageId: 'dryrun-1' })) as never,
    })
    const r = await p.send({ ...MSG, approvalId: 'ap-1' })
    expect(r.state).toBe('sent')
    expect(r.reallySent).toBe(false)
  })

  it('gerçek gönderim yalnız bayrak açık + dryRun false iken sayılır', async () => {
    const p = createGmailDirectProvider({
      env: { GMAIL_SEND_ENABLED: 'true' },
      sendImpl: (async () => ({ ok: true, dryRun: false, gmailMessageId: 'g-1' })) as never,
    })
    expect((await p.send({ ...MSG, approvalId: 'ap-1' })).reallySent).toBe(true)
    expect(p.health({ GMAIL_SEND_ENABLED: 'true' }).canSendReal).toBe(true)
    expect(p.health({}).canSendReal).toBe(false)
  })

  it('"zaten gönderilmişti" yeni gönderim sayılmaz', async () => {
    const p = createGmailDirectProvider({
      env: { GMAIL_SEND_ENABLED: 'true' },
      sendImpl: (async () => ({ ok: true, alreadySent: true, gmailMessageId: 'g-1' })) as never,
    })
    expect((await p.send({ ...MSG, approvalId: 'ap-1' })).reallySent).toBe(false)
  })

  it('needsReconciliation → provider_unknown (kör tekrar yok)', async () => {
    const sendImpl = vi.fn(async () => ({ ok: false, needsReconciliation: true }))
    const p = createGmailDirectProvider({ env: {}, sendImpl: sendImpl as never })
    const r = await p.send({ ...MSG, approvalId: 'ap-1' })
    expect(r.state).toBe('provider_unknown')
    expect(sendImpl).toHaveBeenCalledTimes(1)
  })

  it('gönderim kapısı reddi not_eligible olur', async () => {
    const p = createGmailDirectProvider({
      env: {},
      sendImpl: (async () => ({ ok: false, blockedReasons: ['suppression', 'kanıt yok'] })) as never,
    })
    await expect(p.send({ ...MSG, approvalId: 'ap-1' })).rejects.toMatchObject({ code: 'not_eligible' })
  })

  it('başka istek claim tutuyorsa durum pending kalır', async () => {
    const p = createGmailDirectProvider({ env: {}, sendImpl: (async () => ({ ok: false, inProgress: true })) as never })
    expect((await p.send({ ...MSG, approvalId: 'ap-1' })).state).toBe('pending')
  })

  it('attempt durumu kanonik duruma çevrilir', () => {
    expect(mapAttemptState('sent')).toBe('sent')
    expect(mapAttemptState('reconciled')).toBe('sent')
    expect(mapAttemptState('unknown')).toBe('provider_unknown')
    expect(mapAttemptState('failed')).toBe('failed')
    expect(mapAttemptState('sending')).toBe('pending')
    expect(mapAttemptState(null)).toBe('pending')
  })

  it('uzlaştırma: kademeli güvence BAYPAS EDİLMEZ', async () => {
    // Çekirdek "yeterli arama yok" ya da "açık onay bekliyor" dediğinde bu
    // katman karar ÜRETMEZ.
    for (const outcome of ['not_found_unconfirmed', 'not_found_needs_confirmation']) {
      const p = createGmailDirectProvider({ env: {}, reconcileImpl: (async () => ({ ok: true, outcome })) as never })
      expect((await p.reconcileUnknown('om-1')).outcome).toBe('still_unknown')
    }
    const failed = createGmailDirectProvider({
      env: {},
      reconcileImpl: (async () => ({ ok: true, outcome: 'not_found_marked_failed' })) as never,
    })
    expect((await failed.reconcileUnknown('om-1')).outcome).toBe('confirmed_not_sent')
  })

  it('Gmail cevapları bu yüzeyden POLL EDİLMEZ (ayrı ingest hattı)', async () => {
    expect(await createGmailDirectProvider({ env: {} }).pollEvents(new Date())).toEqual([])
  })
})

// ────────────────────────────── guardedSend ──────────────────────────────────

describe('guardedSend — gönderimin tek kapısı', () => {
  it('uygun olmayan alıcıya gönderim YAPILMAZ', async () => {
    const provider = createFakeOutreachProvider()
    const spy = vi.spyOn(provider, 'send')
    await expect(guardedSend({ provider, message: MSG, outreachEligible: false }))
      .rejects.toMatchObject({ code: 'not_eligible' })
    expect(spy).not.toHaveBeenCalled()
  })

  it('provider_unknown OTOMATİK tekrar gönderilmez', async () => {
    const provider = createFakeOutreachProvider()
    const spy = vi.spyOn(provider, 'send')
    await expect(
      guardedSend({ provider, message: MSG, outreachEligible: true, currentState: 'provider_unknown' }),
    ).rejects.toMatchObject({ code: 'not_eligible' })
    expect(spy).not.toHaveBeenCalled()
  })

  it('AÇIK operatör kararıyla tekrar gönderilebilir', async () => {
    const provider = createFakeOutreachProvider()
    const r = await guardedSend({
      provider,
      message: MSG,
      outreachEligible: true,
      currentState: 'provider_unknown',
      operatorResendApproved: true,
    })
    expect(r.state).toBe('sent')
  })

  it('opt-out ve bounce sonrası gönderim yapılmaz', async () => {
    const provider = createFakeOutreachProvider()
    for (const s of ['opted_out', 'bounced'] as const) {
      await expect(guardedSend({ provider, message: MSG, outreachEligible: true, currentState: s }))
        .rejects.toMatchObject({ code: 'not_eligible' })
    }
  })
})

describe('Fake sağlayıcı — akış uçtan uca, gerçek mail sıfır', () => {
  it('hiçbir yapılandırmayla gerçek gönderim yapamaz', () => {
    expect(createFakeOutreachProvider().health().canSendReal).toBe(false)
  })

  it('bastırılan adres kuyruğa alınmaz', async () => {
    const p = createFakeOutreachProvider()
    await p.suppress(MSG.recipient.email, 'opt_out')
    await expect(p.enqueue(MSG)).rejects.toMatchObject({ code: 'not_eligible' })
  })

  it('enjekte edilen belirsiz arıza provider_unknown üretir', async () => {
    const p = createFakeOutreachProvider({ failFor: { 'om-1': { code: 'timeout', ambiguous: true } } })
    expect((await p.send(MSG)).state).toBe('provider_unknown')
    expect((await p.status('om-1')).state).toBe('provider_unknown')
  })

  it('kanıt varsa uzlaştırma sent`e çevirir, yoksa bilinmez bırakır', async () => {
    const withEvidence = createFakeOutreachProvider({ remoteEvidence: new Set(['om-1']) })
    expect((await withEvidence.reconcileUnknown('om-1')).outcome).toBe('confirmed_sent')
    expect((await createFakeOutreachProvider().reconcileUnknown('om-1')).outcome).toBe('still_unknown')
  })

  it('kesin ret durumu failed yapar ve hata fırlatır', async () => {
    const p = createFakeOutreachProvider({ failFor: { 'om-1': { code: 'rejected', ambiguous: false } } })
    await expect(p.send(MSG)).rejects.toMatchObject({ code: 'rejected' })
    expect((await p.status('om-1')).state).toBe('failed')
  })
})
