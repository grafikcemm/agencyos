import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Telegram webhook route — POST sarmalayıcısının AUTHORITATIVE davranış testleri
// (Sprint-3 Faz 1): auth fail-closed, claim makinesi, cevap-teslimi olmadan
// claim complete YOK, mutation-once, yaşam/satış intent dallanması.
// Tüm dış bağımlılıklar mock; parser (telegramCommandParser/salesCommands) GERÇEK.
// ─────────────────────────────────────────────────────────────────────────────

const SECRET = 'test-webhook-secret'

// ── LIFE DB in-memory mock ───────────────────────────────────────────────────
type Row = Record<string, unknown>
const tables: Record<string, Row[]> = {
  assistant_reminders: [],
  daily_v2: [],
  active_tasks: [],
  career_phases: [],
  career_skills: [],
  assistant_prefs: [],
}
let lifeSeq = 0
let dailyUpsertError: { message: string } | null = null
let taskInsertError: { message: string } | null = null

function lifeFrom(table: string) {
  const rows = (tables[table] ??= [])
  const filters: Array<(r: Row) => boolean> = []
  let op: 'select' | 'insert' | 'update' | 'upsert' = 'select'
  let payload: Row | null = null

  function exec(single: boolean): { data: unknown; error: { message: string } | null } {
    if (op === 'insert' && payload) {
      if (table === 'active_tasks' && taskInsertError) return { data: null, error: taskInsertError }
      const row = { id: `r-${++lifeSeq}`, created_at: new Date().toISOString(), ...payload }
      rows.push(row)
      return { data: single ? row : [row], error: null }
    }
    if (op === 'update' && payload) {
      const matched = rows.filter((r) => filters.every((f) => f(r)))
      matched.forEach((r) => Object.assign(r, payload))
      return { data: single ? (matched[0] ?? null) : matched, error: null }
    }
    if (op === 'upsert' && payload) {
      if (table === 'daily_v2' && dailyUpsertError) return { data: null, error: dailyUpsertError }
      const existing = rows.find((r) => r.date === payload!.date)
      if (existing) Object.assign(existing, payload)
      else rows.push({ id: `r-${++lifeSeq}`, ...payload })
      return { data: null, error: null }
    }
    const matched = rows.filter((r) => filters.every((f) => f(r)))
    return { data: single ? (matched[0] ?? null) : matched, error: null }
  }

  const api: Record<string, unknown> = {}
  Object.assign(api, {
    select: () => api,
    eq: (c: string, v: unknown) => {
      filters.push((r) => r[c] === v)
      return api
    },
    order: () => api,
    limit: () => api,
    insert: (row: Row) => {
      op = 'insert'
      payload = row
      return api
    },
    update: (patch: Row) => {
      op = 'update'
      payload = patch
      return api
    },
    upsert: (row: Row) => {
      op = 'upsert'
      payload = row
      return api
    },
    maybeSingle: async () => exec(true),
    single: async () => exec(true),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(exec(false)).then(resolve, reject),
  })
  return api
}
vi.mock('@/lib/lifeSupabaseAdmin', () => ({ lifeSupabaseAdmin: { from: (t: string) => lifeFrom(t) } }))

// ── reply delivery mock (Faz 1 durum makinesi sonuçları enjekte edilir) ─────
interface RD {
  delivered: boolean
  countsAsDelivered: boolean
  kind: string
  httpStatus: number
  error: string | null
}
function rd(kind: string): RD {
  const delivered = ['sent', 'deduped_sent', 'unledgered_sent', 'sent_unrecorded'].includes(kind)
  const counts = ['sent', 'deduped_sent', 'unledgered_sent'].includes(kind)
  return { delivered, countsAsDelivered: counts, kind, httpStatus: kind === 'failed' ? 400 : 200, error: null }
}
const replyCalls: Array<{ updateId: number; seq: number; text: string }> = []
let replyScript: string[] = [] // kind sırası; tükendiğinde 'sent'
vi.mock('@/lib/telegram/replyDelivery', () => ({
  sendReplyOnce: async (opts: { updateId: number; seq: number; text: string }) => {
    replyCalls.push(opts)
    return rd(replyScript.shift() ?? 'sent')
  },
}))

// ── claim makinesi mock ──────────────────────────────────────────────────────
let acquireResult: Record<string, unknown> = {}
const completeMock = vi.fn()
const failMock = vi.fn()
vi.mock('@/lib/telegram/updateClaims', () => ({
  acquireUpdateClaim: async () => acquireResult,
  completeUpdateClaim: (...a: unknown[]) => completeMock(...a),
  failUpdateClaim: (...a: unknown[]) => failMock(...a),
}))

// ── pending actions mock (durable seçim) ─────────────────────────────────────
const pendings = new Map<string, { type: string; payload: Row }>()
vi.mock('@/lib/telegram/pendingActions', () => ({
  setPendingAction: async (chatKey: string, type: string, payload: Row) => {
    pendings.set(chatKey, { type, payload })
    return { ok: true }
  },
  consumePendingAction: async (chatKey: string) => {
    const p = pendings.get(chatKey) ?? null
    pendings.delete(chatKey)
    return p
  },
}))

// ── satış handler mock (parser GERÇEK) ──────────────────────────────────────
const salesMock = vi.fn()
vi.mock('@/lib/telegram/salesHandlers', () => ({
  handleSalesCommand: (...a: unknown[]) => salesMock(...a),
}))

// ── asistan hafızası mock ────────────────────────────────────────────────────
const convoLogs: Array<{ role: string; message: string; intent: string | null }> = []
let logThrowNext = false
const commitments = new Map<string, Row>()
const commitmentDone = vi.fn()
const commitmentMissed = vi.fn()
vi.mock('@/lib/assistant/memory', () => ({
  logConversationTurn: async (t: { role: string; message: string; intent?: string | null }) => {
    if (logThrowNext) {
      logThrowNext = false
      throw new Error('memory down')
    }
    convoLogs.push({ role: t.role, message: t.message, intent: t.intent ?? null })
  },
  getRecentConversation: async () => [],
  getCommitment: async (date: string) => commitments.get(date) ?? null,
  setCommitment: async (date: string, patch: Row) => {
    commitments.set(date, { ...(commitments.get(date) ?? {}), ...patch })
  },
  markCommitmentDone: (...a: unknown[]) => commitmentDone(...a),
  markCommitmentMissed: (...a: unknown[]) => commitmentMissed(...a),
}))

// ── mentor/intent/LLM mock'ları ──────────────────────────────────────────────
let snoozeDecision = { message: 'SNOOZE-KARARI', deferCount: 1, suppressNextNudge: false }
vi.mock('@/lib/assistant/mentorLoop', () => ({
  runMentorFreeText: async () => ({ reply: 'MENTOR-CEVABI', agent: 'mentor' }),
  decideSnooze: async () => snoozeDecision,
  microStartAck: () => 'MIKRO-BASLANGIC',
  commitmentTimeQuestion: (c: string) => `SAAT-SORUSU:${c}`,
  commitmentSetConfirmation: (c: string, t: string) => `TAAHHUT-ONAY:${c}@${t}`,
  eveningDoneCelebration: async () => 'AKSAM-KUTLAMA',
  capabilitiesReply: () => 'YETENEK-LISTESI',
}))
let msgIntent = 'other'
vi.mock('@/lib/assistant/intent', () => ({ classifyMessageIntent: () => msgIntent }))
let questionRoute = 'life_mentor'
let classifyThrows = false
vi.mock('@/lib/assistant/classifyQuestion', () => ({
  classifyQuestion: async () => {
    if (classifyThrows) throw new Error('router down')
    return { route: questionRoute }
  },
}))
vi.mock('@/lib/assistant/deliberate', () => ({
  deliberateBusiness: async () => ({ reply: 'IS-KURULU-CEVABI' }),
}))
let jarvisThrows = false
let jarvisReply = 'JARVIS-CEVABI'
vi.mock('@/lib/jarvis/engine', () => ({
  runJarvis: async () => {
    if (jarvisThrows) throw new Error('jarvis down')
    return { reply: jarvisReply }
  },
}))
let prefSignals: Record<string, unknown> = {}
const upsertPrefs = vi.fn(async () => {})
vi.mock('@/lib/assistant/learnPrefs', () => ({
  extractPrefSignals: () => prefSignals,
  upsertAssistantPrefs: () => upsertPrefs(),
}))
vi.mock('@/app/actions/dailyV2', () => ({ derivePolicyState: async () => ({}) }))
let planVariant: 'dolu' | 'bos' = 'dolu'
vi.mock('@/lib/dailyOrchestrator', () => ({
  calculateLocalTodayPlan: (input: { agencyLoad: string; energy: string }) =>
    planVariant === 'dolu'
      ? {
          mode: 'denge',
          agencyLoad: input.agencyLoad,
          energy: input.energy,
          todayLock: 'TEK-KILIT-IS',
          maxActiveTasks: 3,
          priorityTasks: [{ title: 'Öncelikli iş 1' }],
          health: { todaySummary: 'sağlık ok' },
          readingTarget: '10 sayfa',
          financeWarnings: ['taksit uyarısı'],
        }
      : {
          mode: 'atak',
          agencyLoad: input.agencyLoad,
          energy: input.energy,
          todayLock: 'TEK-KILIT-IS',
          maxActiveTasks: 5,
          priorityTasks: [],
          health: { todaySummary: 'sağlık ok' },
          readingTarget: null,
          financeWarnings: [],
        },
}))
let orchestratorActive = true
vi.mock('@/data/orchestratorConfig', () => ({ isOrchestratorActive: () => orchestratorActive }))
const TODAY = '2026-07-13'
vi.mock('@/lib/assistant/timezone', () => ({
  getIstanbulDateAndDay: () => ({ todayStr: TODAY, dayName: 'Pazar' }),
}))

import { POST } from './route'

// ── yardımcılar ──────────────────────────────────────────────────────────────
function makeReq(body: unknown, opts?: { secret?: string | null; raw?: string }) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  const secret = opts?.secret === undefined ? SECRET : opts.secret
  if (secret !== null) headers['x-telegram-bot-api-secret-token'] = secret
  return new Request('http://localhost/api/telegram', {
    method: 'POST',
    headers,
    body: opts?.raw ?? JSON.stringify(body),
  })
}
let updateSeq = 5000
function upd(text: string, id?: number) {
  const uid = id ?? ++updateSeq
  return { update_id: uid, message: { message_id: uid, text, chat: { id: 42 }, from: { id: 7 } } }
}
const sentTexts = () => replyCalls.map((c) => c.text)

beforeEach(() => {
  vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', SECRET)
  vi.stubEnv('TELEGRAM_CHAT_ID', '42')
  vi.stubEnv('TELEGRAM_USER_ID', '7')
  for (const k of Object.keys(tables)) tables[k] = []
  lifeSeq = 0
  dailyUpsertError = null
  taskInsertError = null
  replyCalls.length = 0
  replyScript = []
  acquireResult = { acquired: true, mode: 'state', fence: { updateId: 1, token: 'tok', attempt: 1 } }
  completeMock.mockReset().mockResolvedValue({ ok: true })
  failMock.mockReset().mockResolvedValue({ ok: true })
  pendings.clear()
  salesMock.mockReset().mockResolvedValue('SATIS-CEVABI')
  convoLogs.length = 0
  logThrowNext = false
  commitments.clear()
  commitmentDone.mockReset()
  commitmentMissed.mockReset()
  snoozeDecision = { message: 'SNOOZE-KARARI', deferCount: 1, suppressNextNudge: false }
  msgIntent = 'other'
  questionRoute = 'life_mentor'
  classifyThrows = false
  jarvisThrows = false
  prefSignals = {}
  upsertPrefs.mockClear()
  orchestratorActive = true
  planVariant = 'dolu'
  jarvisReply = 'JARVIS-CEVABI'
})

describe('auth + doğrulama (fail-closed)', () => {
  it('secret yok/yanlış → 401; env secret tanımsızken de 401', async () => {
    expect((await POST(makeReq(upd('x'), { secret: null }))).status).toBe(401)
    expect((await POST(makeReq(upd('x'), { secret: 'yanlis' }))).status).toBe(401)
    vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', '')
    expect((await POST(makeReq(upd('x')))).status).toBe(401)
  })

  it('64KB üstü gövde → 413; bozuk JSON → 400; şema dışı → no-op 200', async () => {
    expect((await POST(makeReq(null, { raw: 'x'.repeat(65 * 1024) }))).status).toBe(413)
    expect((await POST(makeReq(null, { raw: '{bozuk' }))).status).toBe(400)
    const r = await POST(makeReq({ hic: 'update degil' }))
    expect(r.status).toBe(200)
    expect((await r.json()).ignored).toBe('schema')
  })

  it('text\'siz mesaj → no-op; yanlış chat/user → işlenmez; USER_ID env yoksa fail-closed', async () => {
    const noText = await POST(makeReq({ update_id: 1, message: { chat: { id: 42 }, from: { id: 7 } } }))
    expect(noText.status).toBe(200)

    const wrongChat = upd('x')
    wrongChat.message.chat.id = 99
    expect((await (await POST(makeReq(wrongChat))).json()).ignored).toBe('chat')

    const wrongUser = upd('x')
    wrongUser.message.from.id = 99
    expect((await (await POST(makeReq(wrongUser))).json()).ignored).toBe('user')

    vi.stubEnv('TELEGRAM_USER_ID', '')
    expect((await (await POST(makeReq(upd('x')))).json()).ignored).toBe('user_env')
    expect(replyCalls).toHaveLength(0) // hiçbirine cevap üretilmedi
  })
})

describe('claim makinesi sarmalayıcısı (authoritative)', () => {
  it('duplicate claim → yan etkisiz 200 deduped', async () => {
    acquireResult = { acquired: false, reason: 'duplicate' }
    const r = await POST(makeReq(upd('/bugun')))
    expect(r.status).toBe(200)
    expect((await r.json()).deduped).toBe(true)
    expect(salesMock).not.toHaveBeenCalled()
  })

  it('claim store unavailable (PROD fail-closed) → 503, handler ÇALIŞMAZ', async () => {
    acquireResult = { acquired: false, reason: 'unavailable' }
    const r = await POST(makeReq(upd('/bugun')))
    expect(r.status).toBe(503)
    expect(salesMock).not.toHaveBeenCalled()
  })

  it('başarı → completeUpdateClaim çağrılır, 200', async () => {
    const r = await POST(makeReq(upd('/bugun')))
    expect(r.status).toBe(200)
    expect(completeMock).toHaveBeenCalledTimes(1)
    expect(failMock).not.toHaveBeenCalled()
  })

  it('CLAIM FINALIZE DB HATASI → 200 DÖNÜLMEZ (500; Telegram retry eder)', async () => {
    completeMock.mockResolvedValue({ ok: false, reason: 'db_error' })
    const r = await POST(makeReq(upd('/bugun')))
    expect(r.status).toBe(500)
  })

  it('handler throw → failUpdateClaim + 500 (mesaj kaybolmaz, yeniden denenebilir)', async () => {
    logThrowNext = true // salesCmd yolunda logConversationTurn patlar
    const r = await POST(makeReq(upd('/bugun')))
    expect(r.status).toBe(500)
    expect(failMock).toHaveBeenCalledTimes(1)
    expect(completeMock).not.toHaveBeenCalled()
  })
})

describe('cevap teslimi AUTHORITATIVE (Faz 1.6/1.7)', () => {
  it('cevap UNKNOWN (belirsiz) → claim complete EDİLMEZ; failUpdateClaim + 500; İKİNCİ provider çağrısı YOK', async () => {
    replyScript = ['unknown']
    const r = await POST(makeReq(upd('/bugun')))
    expect(r.status).toBe(500)
    expect(failMock).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('reply undelivered'))
    expect(completeMock).not.toHaveBeenCalled()
    expect(replyCalls).toHaveLength(1) // belirsizde stripHtml retry'ı da YOK
  })

  it('KESİN failure → stripHtml retry (yeni seq) telafi ederse 200', async () => {
    replyScript = ['failed', 'sent']
    const r = await POST(makeReq(upd('/bugun')))
    expect(r.status).toBe(200)
    expect(replyCalls).toHaveLength(2)
    expect(replyCalls[1].seq).toBe(2) // kesin başarısızlıkta yeni deneme serbest
    expect(completeMock).toHaveBeenCalledTimes(1)
  })

  it('KESİN failure + retry de düşerse → 500', async () => {
    replyScript = ['failed', 'failed']
    const r = await POST(makeReq(upd('/bugun')))
    expect(r.status).toBe(500)
    expect(completeMock).not.toHaveBeenCalled()
  })

  it('sendTelegram yolu (yaşam intenti) başarısızsa da claim complete edilmez', async () => {
    replyScript = ['unknown']
    const r = await POST(makeReq(upd('/plan')))
    expect(r.status).toBe(500)
  })

  it('deduped_sent (retry senaryosu) teslim SAYILIR → 200; conversation log TEKRARLANMAZ', async () => {
    replyScript = ['deduped_sent']
    const r = await POST(makeReq(upd('/bugun')))
    expect(r.status).toBe(200)
    expect(convoLogs.filter((l) => l.role === 'assistant')).toHaveLength(0) // yeniden loglanmadı
  })

  it('sent_unrecorded (provider ok, ledger finalize düştü) → teslim edildi ama 500 (authoritative)', async () => {
    replyScript = ['sent_unrecorded']
    const r = await POST(makeReq(upd('/bugun')))
    expect(r.status).toBe(500)
  })
})

describe('mutation-once: görev ekleme akışı (Faz 1.9)', () => {
  it('"görev ekle:" → durable pending + 1/2 sorusu; "1" → TEK insert; cevap unknown olsa bile mutasyon TEKRARLANMAZ', async () => {
    const r1 = await POST(makeReq(upd('görev ekle: e2e görevi')))
    expect(r1.status).toBe(200)
    expect(pendings.get('42')?.type).toBe('add_task_choice')
    expect(sentTexts().join(' ')).toContain('nereye ekleyeyim')

    // "1" cevabı: insert başarılı ama cevap teslimi BELİRSİZ → 500.
    replyScript = ['unknown']
    const r2 = await POST(makeReq(upd('1', 7001)))
    expect(r2.status).toBe(500)
    expect(tables.active_tasks).toHaveLength(1)
    expect(tables.active_tasks[0]).toMatchObject({ title: 'e2e görevi', category: 'active' })

    // Telegram AYNI update'i retry eder: pending tüketilmişti → farklı dal cevabı,
    // ama active_tasks'e İKİNCİ satır YAZILMAZ (yan etki bir kez uygulanır).
    replyScript = ['deduped_sent']
    const r3 = await POST(makeReq(upd('1', 7001)))
    expect(r3.status).toBe(200)
    expect(tables.active_tasks).toHaveLength(1)
  })

  it('"2" → waiting kategorisi; insert hatası kullanıcıya görünür', async () => {
    await POST(makeReq(upd('görev ekle: bekleyen iş')))
    await POST(makeReq(upd('2')))
    expect(tables.active_tasks[0]).toMatchObject({ category: 'waiting' })

    await POST(makeReq(upd('görev ekle: hatalı iş')))
    taskInsertError = { message: 'insert fail' }
    await POST(makeReq(upd('1')))
    expect(sentTexts().join(' ')).toContain('kaydedilemedi')
  })

  it('pending yokken "1" → MUTASYONSUZ güvenli açıklama', async () => {
    await POST(makeReq(upd('1')))
    expect(tables.active_tasks).toHaveLength(0)
    expect(sentTexts().join(' ')).toContain('Bekleyen bir seçim yok')
  })

  it('pending var ama başlık yok/boş → görev YAZILMAZ, yeniden başlat mesajı', async () => {
    pendings.set('42', { type: 'add_task_choice', payload: {} }) // title hiç yok (?? dalı)
    await POST(makeReq(upd('1')))
    pendings.set('42', { type: 'add_task_choice', payload: { title: '  ' } })
    await POST(makeReq(upd('2')))
    expect(tables.active_tasks).toHaveLength(0)
    expect(sentTexts().join(' ')).toContain('kayboldu')
  })
})

describe('satış komutları (parser gerçek, handler mock)', () => {
  it('/bugun → handleSalesCommand({updateId, chatKey}); kullanıcı turu sales intent\'iyle loglanır', async () => {
    const u = upd('/bugun', 8001)
    await POST(makeReq(u))
    expect(salesMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sales_today' }),
      { updateId: 8001, chatKey: '42' },
    )
    expect(convoLogs.some((l) => l.role === 'user' && l.intent === 'sales:sales_today')).toBe(true)
    expect(sentTexts()).toContain('SATIS-CEVABI')
  })

  it('satış handler hatası → kullanıcıya açıklayıcı cevap, 200 (mesaj yutulmaz)', async () => {
    salesMock.mockRejectedValue(new Error('cockpit down'))
    const r = await POST(makeReq(upd('Klinik X arandı')))
    expect(r.status).toBe(200)
    expect(sentTexts().join(' ')).toContain('Satış komutu işlenemedi')
  })

  it('orchestrator aktif değilse satış komutu bile işlenmez, bilgi mesajı gider', async () => {
    orchestratorActive = false
    await POST(makeReq(upd('/bugun')))
    expect(salesMock).not.toHaveBeenCalled()
    expect(sentTexts().join(' ')).toContain('henüz aktif değil')
  })
})

describe('yaşam intentleri (v2)', () => {
  it('set_day_mode: "normalim" → daily_v2 upsert + onay; upsert hatası görünür', async () => {
    await POST(makeReq(upd('normalim')))
    expect(tables.daily_v2[0]).toMatchObject({ date: TODAY, day_mode: 'normal' })
    expect(sentTexts().join(' ')).toContain('Mod ayarlandı')

    dailyUpsertError = { message: 'db fail' }
    await POST(makeReq(upd('yoğunum')))
    expect(sentTexts().join(' ')).toContain('kaydedilemedi')
  })

  it('"tamam" → son pending reminder done; akşam taahhüdü varsa kutlama + markCommitmentDone', async () => {
    tables.assistant_reminders.push({ id: 'rem1', date: TODAY, status: 'pending', created_at: 'x' })
    await POST(makeReq(upd('tamam')))
    expect(tables.assistant_reminders[0].status).toBe('done')
    expect(sentTexts().join(' ')).toContain('Helal')

    commitments.set(TODAY, { commitment: 'teklif gönder', status: 'pending', asked_evening: true })
    await POST(makeReq(upd('tamam')))
    expect(commitmentDone).toHaveBeenCalledWith(TODAY)
    expect(sentTexts().join(' ')).toContain('AKSAM-KUTLAMA')
  })

  it('"pas" → skipped; akşamsa missed + blocker sorusu', async () => {
    tables.assistant_reminders.push({ id: 'rem1', date: TODAY, status: 'pending', created_at: 'x' })
    await POST(makeReq(upd('pas')))
    expect(tables.assistant_reminders[0].status).toBe('skipped')

    commitments.set(TODAY, { commitment: 'x', status: 'pending', asked_evening: true })
    await POST(makeReq(upd('pas')))
    expect(commitmentMissed).toHaveBeenCalledWith(TODAY)
    expect(sentTexts().join(' ')).toContain('önüne ne çıktı')
  })

  it('"açtım" → mikro başlangıç onayı', async () => {
    await POST(makeReq(upd('açtım')))
    expect(sentTexts()).toContain('MIKRO-BASLANGIC')
  })

  it('snooze: "ertele" → karar mesajı + snoozed kayıt; saatli "15:30 sonra hatırlat" → saat onayı', async () => {
    tables.assistant_reminders.push({ id: 'rem1', date: TODAY, status: 'pending', created_at: 'x' })
    await POST(makeReq(upd('ertele')))
    expect(sentTexts().join(' ')).toContain('SNOOZE-KARARI')
    expect(tables.assistant_reminders[0].status).toBe('snoozed')

    await POST(makeReq(upd('15:30 sonra hatırlat')))
    expect(sentTexts().join(' ')).toContain('15:30 için not ettim')

    snoozeDecision = { message: 'ARTIK-SORMAM', deferCount: 3, suppressNextNudge: true }
    await POST(makeReq(upd('16:00 sonra hatırlat')))
    expect(sentTexts().join(' ')).toContain('ARTIK-SORMAM')
  })

  it('öğün sorusu → tercihlere saygılı öneri', async () => {
    tables.assistant_prefs.push({ id: 1, food_likes: [], food_dislikes: ['ton balığı'], notes: null })
    await POST(makeReq(upd('bugün ne yiyeceğim')))
    const meal = sentTexts().join(' ')
    expect(meal).toContain('Öğün önerisi')
    expect(meal).toContain('Kaçınılanlar gözetildi')
  })

  it('/plan → plan metni (kilit + öncelikli işler + finans uyarısı)', async () => {
    await POST(makeReq(upd('/plan')))
    const plan = sentTexts().join(' ')
    expect(plan).toContain('TEK-KILIT-IS')
    expect(plan).toContain('Öncelikli iş 1')
    expect(plan).toContain('taksit uyarısı')
  })

  it('"yoğun düşük" (set_state) → plan; "/yogun" → ajans onayı; "/enerji yüksek" → enerji onayı', async () => {
    await POST(makeReq(upd('yoğun düşük')))
    expect(sentTexts().join(' ')).toContain('TEK-KILIT-IS')

    await POST(makeReq(upd('/yogun')))
    expect(sentTexts().join(' ')).toContain('Ajans yoğunluğu güncellendi')

    await POST(makeReq(upd('/enerji yüksek')))
    expect(sentTexts().join(' ')).toContain('Enerji seviyesi güncellendi')
  })

  it('sabah check-in canlıyken enerji/ajans cevabı → "tek kesin iş" taahhüt sorusu', async () => {
    tables.assistant_reminders.push({ id: 'm1', date: TODAY, reminder_type: 'morning_checkin', status: 'sent' })
    await POST(makeReq(upd('/normal')))
    expect(sentTexts().join(' ')).toContain('tek</b> şey')
    expect(commitments.get(TODAY)).toMatchObject({ status: 'pending' })
  })

  it('statik komutlar: sadeleştir/ritimler/sağlık/finans/kitap/shutdown/durum', async () => {
    await POST(makeReq(upd('/sadelestir')))
    await POST(makeReq(upd('/ritimler')))
    await POST(makeReq(upd('/saglik')))
    await POST(makeReq(upd('/finans')))
    await POST(makeReq(upd('/kitap')))
    await POST(makeReq(upd('/shutdown')))
    tables.daily_v2.push({ date: TODAY, day_mode: 'yogun', protein_meal: true, water_3l: false, walk_35: false })
    await POST(makeReq(upd('/durum')))
    const all = sentTexts().join(' ')
    expect(all).toContain('Sadeleştirme moduna geçildi')
    expect(all).toContain('bonusları')
    expect(all).toContain('Sağlık minimumu')
    expect(all).toContain('Finans notu')
    expect(all).toContain('Okuma hedefi')
    expect(all).toContain('Günü kapatalım')
    expect(all).toContain('Bugünkü durum')
  })

  it('learn_preferences: sinyal varsa "not aldım"; sinyal yoksa komut listesi', async () => {
    prefSignals = { food_dislikes: ['süt'] }
    await POST(makeReq(upd('süt sevmiyorum')))
    expect(upsertPrefs).toHaveBeenCalled()
    expect(sentTexts().join(' ')).toContain('not aldım')

    prefSignals = {}
    await POST(makeReq(upd('bunu hiç istemiyorum')))
    expect(sentTexts().join(' ')).toContain('Komutlar:')
  })
})

describe('default dal: taahhüt döngüsü + Jarvis + akıllı yönlendirme', () => {
  it('meta soru → deterministik yetenek cevabı (taahhüt akışı tetiklenmez)', async () => {
    msgIntent = 'meta'
    await POST(makeReq(upd('sen neler yapabiliyorsun acaba')))
    expect(sentTexts()).toContain('YETENEK-LISTESI')
  })

  it('eylemsel görev → Jarvis; Jarvis hatasında zarif fallback', async () => {
    await POST(makeReq(upd('X kliniği için pitch oluştur lütfen')))
    expect(sentTexts()).toContain('JARVIS-CEVABI')

    jarvisThrows = true
    await POST(makeReq(upd('bir carousel hazırla')))
    expect(sentTexts().join(' ')).toContain('tekrar yazar mısın')
  })

  it('taahhüt yakalama: placeholder varken commitment_candidate → kaydet + saat sorusu', async () => {
    commitments.set(TODAY, { commitment: null, status: 'pending', asked_evening: false })
    msgIntent = 'commitment_candidate'
    await POST(makeReq(upd('bugün teklif dosyasını bitireceğim')))
    expect(commitments.get(TODAY)).toMatchObject({ commitment: 'bugün teklif dosyasını bitireceğim' })
    expect(sentTexts().join(' ')).toContain('SAAT-SORUSU')
  })

  it('taahhüt var + saat cevabı ("14:30 gibi olur") → do_at set + onay', async () => {
    commitments.set(TODAY, { commitment: 'teklifi bitir', do_at: null, asked_evening: false })
    await POST(makeReq(upd('14:30 gibi olur')))
    expect(commitments.get(TODAY)).toMatchObject({ do_at: '14:30' })
    expect(sentTexts().join(' ')).toContain('TAAHHUT-ONAY')
  })

  it('enerji kelimesi ("yorgun") + taahhüt yok + sabah aktif → enerji kaydı + taahhüt sorusu', async () => {
    tables.assistant_reminders.push({ id: 'm1', date: TODAY, reminder_type: 'morning_checkin', status: 'sent' })
    await POST(makeReq(upd('yorgun')))
    expect(sentTexts().join(' ')).toContain('tek</b> şey')
  })

  it('serbest metin: iş sorusu → çok-ajanlı kurul; hayat → mentor; router hatası → fallback', async () => {
    questionRoute = 'business_deliberate'
    await POST(makeReq(upd('yeni müşteri fiyatlamasını nasıl kurgulayayım')))
    expect(sentTexts()).toContain('IS-KURULU-CEVABI')

    questionRoute = 'life_mentor'
    await POST(makeReq(upd('bugün kafam çok dağınık')))
    expect(sentTexts()).toContain('MENTOR-CEVABI')

    classifyThrows = true
    await POST(makeReq(upd('random bir mesaj daha')))
    expect(sentTexts().join(' ')).toContain('tekrar yazar mısın')
  })
})

describe('dal kapsaması: kenar durumlar', () => {
  it('failUpdateClaim de yazılamazsa 500 korunur (hata gizlenmez)', async () => {
    replyScript = ['unknown']
    failMock.mockResolvedValue({ ok: false, reason: 'db_error' })
    const r = await POST(makeReq(upd('/bugun')))
    expect(r.status).toBe(500)
  })

  it('Jarvis boş cevap dönerse GRACEFUL fallback metni gönderilir', async () => {
    jarvisReply = ''
    await POST(makeReq(upd('bir carousel hazırla')))
    expect(sentTexts().join(' ')).toContain('tekrar yazar mısın')
  })

  it('boş plan varyantı: öncelikli işler/okuma/finans satırları atlanır', async () => {
    planVariant = 'bos'
    await POST(makeReq(upd('/plan')))
    const plan = sentTexts().join(' ')
    expect(plan).toContain('TEK-KILIT-IS')
    expect(plan).not.toContain('Öncelikli işler')
    expect(plan).not.toContain('Okuma')
  })

  it('öğün: tercih satırı yoksa "Kaçınılanlar" satırı yok', async () => {
    await POST(makeReq(upd('bugün ne yiyeceğim')))
    expect(sentTexts().join(' ')).not.toContain('Kaçınılanlar')
  })

  it('/durum day_mode seçilmemişken "Seçilmedi"', async () => {
    tables.daily_v2.push({ date: TODAY, day_mode: null, protein_meal: false, water_3l: false, walk_35: false })
    await POST(makeReq(upd('/durum')))
    expect(sentTexts().join(' ')).toContain('Seçilmedi')
  })

  it('"tamam"/"pas" pending reminder YOKKEN de düşmez (genel cevap)', async () => {
    await POST(makeReq(upd('tamam')))
    expect(sentTexts().join(' ')).toContain('Helal')
    await POST(makeReq(upd('pas')))
    expect(sentTexts().join(' ')).toContain('Yarın tekrar deneriz')
  })

  it('TELEGRAM_CHAT_ID env eksik → fail-closed ignored chat', async () => {
    vi.stubEnv('TELEGRAM_CHAT_ID', '')
    const r = await POST(makeReq(upd('x')))
    expect((await r.json()).ignored).toBe('chat')
  })

  it('kısa metin (<4 harf) eylemsel SAYILMAZ → mentor yoluna düşer', async () => {
    await POST(makeReq(upd('ara')))
    expect(sentTexts()).toContain('MENTOR-CEVABI')
  })

  it('taahhüt var + saat DEĞİL + aday değil → mentor akışı bozulmadan devam', async () => {
    commitments.set(TODAY, { commitment: 'teklifi bitir', do_at: null, asked_evening: false })
    msgIntent = 'other'
    await POST(makeReq(upd('bugün biraz yorgunum gibi hissediyorum')))
    expect(sentTexts()).toContain('MENTOR-CEVABI')
  })

  it('taahhüt adayı ama saatsiz → metin timeHint olarak kaydedilir', async () => {
    commitments.set(TODAY, { commitment: 'teklifi bitir', do_at: null, asked_evening: false })
    msgIntent = 'commitment_candidate'
    await POST(makeReq(upd('öğleden sonra hallederim')))
    expect(commitments.get(TODAY)?.do_at).toBeTruthy()
    expect(sentTexts().join(' ')).toContain('TAAHHUT-ONAY')
  })

  it('passiveSignals: tercih dışı mesajda da sinyal varsa upsert edilir', async () => {
    prefSignals = { food_likes: ['tavuk'] }
    await POST(makeReq(upd('/plan')))
    expect(upsertPrefs).toHaveBeenCalled()
  })

  it('snooze: bekleyen reminder yokken saatli erteleme yeni snoozed kaydı yaratır', async () => {
    await POST(makeReq(upd('ertele')))
    expect(tables.assistant_reminders.some((r) => r.status === 'snoozed')).toBe(true)
  })

  it('handler throw + failUpdateClaim de yazılamıyor → yine 500, hata loglanır', async () => {
    logThrowNext = true
    failMock.mockResolvedValue({ ok: false, reason: 'db_error' })
    const r = await POST(makeReq(upd('/bugun')))
    expect(r.status).toBe(500)
  })

  it('"idare" / "enerjik" enerji kelimeleri (parser dışı) sabah akışını tetikler', async () => {
    tables.assistant_reminders.push({ id: 'm1', date: TODAY, reminder_type: 'morning_checkin', status: 'sent' })
    await POST(makeReq(upd('idare')))
    expect(sentTexts().join(' ')).toContain('tek</b> şey')

    commitments.clear()
    tables.assistant_reminders.length = 0
    tables.assistant_reminders.push({ id: 'm2', date: TODAY, reminder_type: 'morning_checkin', status: 'sent' })
    await POST(makeReq(upd('enerjik')))
    expect(sentTexts().join(' ')).toContain('tek</b> şey')
  })

  it('taahhüt zaten varken enerji/ajans cevabı taahhüt sorusunu TEKRAR açmaz', async () => {
    commitments.set(TODAY, { commitment: 'iş bitir', status: 'pending', asked_evening: false, do_at: '14:00' })
    tables.assistant_reminders.push({ id: 'm1', date: TODAY, reminder_type: 'morning_checkin', status: 'sent' })
    await POST(makeReq(upd('/normal')))
    expect(sentTexts().join(' ')).toContain('Ajans yoğunluğu güncellendi')
  })

  it('"dağıldım" → Dağılmış mod etiketi', async () => {
    await POST(makeReq(upd('dağıldım')))
    expect(sentTexts().join(' ')).toContain('Dağılmış')
  })

  it('aktif kariyer fazı + görev kategorileri plan girdilerine akar', async () => {
    tables.career_phases.push({ id: 'p1', title: 'Faz 1', is_active: true })
    tables.career_skills.push({ id: 's1', phase_id: 'p1', title: 'Skill A', is_completed: false })
    tables.active_tasks.push(
      { id: 't1', title: 'Aktif iş', category: 'active', is_priority: true },
      { id: 't2', title: 'Bekleyen iş', category: 'waiting', is_priority: false },
    )
    await POST(makeReq(upd('/plan')))
    expect(sentTexts().join(' ')).toContain('TEK-KILIT-IS')
  })

  it('daily_v2 satırı ui_mode\'suz → "denge" varsayılanıyla çalışır', async () => {
    tables.daily_v2.push({ date: TODAY, day_mode: 'normal', agency_load: 'normal', energy: 'medium', ui_mode: null })
    await POST(makeReq(upd('/plan')))
    expect(sentTexts().join(' ')).toContain('Planı')
  })

  it('reply() yolunda deduped_sent → teslim sayılır ama YENİDEN loglanmaz', async () => {
    replyScript = ['deduped_sent']
    const r = await POST(makeReq(upd('tamam')))
    expect(r.status).toBe(200)
    expect(convoLogs.filter((l) => l.role === 'assistant')).toHaveLength(0)
  })
})
