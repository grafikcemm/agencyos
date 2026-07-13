import { NextResponse } from 'next/server';
import { lifeSupabaseAdmin as supabaseAdmin } from '@/lib/lifeSupabaseAdmin';
import { parseTelegramMessage, parseTimeHint } from '@/lib/telegramCommandParser';
import { calculateLocalTodayPlan } from '@/lib/dailyOrchestrator';
import { isOrchestratorActive } from '@/data/orchestratorConfig';
import { extractPrefSignals, upsertAssistantPrefs } from '@/lib/assistant/learnPrefs';
import type { AssistantDailyState, AgencyLoad, EnergyLevel, PlanMode, UnifiedTodayPlan } from '@/lib/dailyOrchestrator';
import { derivePolicyState } from '@/app/actions/dailyV2';
import { getIstanbulDateAndDay } from '@/lib/assistant/timezone';
import {
  logConversationTurn,
  getRecentConversation,
  getCommitment,
  setCommitment,
  markCommitmentDone,
  markCommitmentMissed,
} from '@/lib/assistant/memory';
import {
  runMentorFreeText,
  decideSnooze,
  microStartAck,
  commitmentTimeQuestion,
  commitmentSetConfirmation,
  eveningDoneCelebration,
  capabilitiesReply,
} from '@/lib/assistant/mentorLoop';
import { classifyMessageIntent } from '@/lib/assistant/intent';
import { classifyQuestion } from '@/lib/assistant/classifyQuestion';
import { deliberateBusiness } from '@/lib/assistant/deliberate';
import { runJarvis } from '@/lib/jarvis/engine';

// OpenRouter reasoning modelleri yavaş — 25s LLM timeout'una alan tanı (Vercel).
export const maxDuration = 60;

import { z } from 'zod';
import { sendReplyOnce } from '@/lib/telegram/replyDelivery';
import { acquireUpdateClaim, completeUpdateClaim, failUpdateClaim } from '@/lib/telegram/updateClaims';
import { parseSalesCommand } from '@/lib/telegram/salesCommands';
import { handleSalesCommand } from '@/lib/telegram/salesHandlers';
import { setPendingAction, consumePendingAction } from '@/lib/telegram/pendingActions';

// ── Update şeması (Faz B3) ────────────────────────────────────────────────────
// Minimum doğrulama: update_id zorunlu; message alanları opsiyonel ama TİPLİ.
// Mesaj-dışı update'ler (edited_message, callback_query…) güvenli no-op.
const TelegramUpdateSchema = z
  .object({
    update_id: z.number().int(),
    message: z
      .object({
        message_id: z.number().optional(),
        text: z.string().max(4096).optional(),
        chat: z.object({ id: z.union([z.number(), z.string()]) }).optional(),
        from: z.object({ id: z.union([z.number(), z.string()]) }).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const MAX_UPDATE_BYTES = 64 * 1024;

// Serbest mesaj eylemsel bir görev/üretim isteği mi? (Jarvis araç motoruna yönlendir.)
// İmperatif/üretim fiilleri — hayat sohbetini yutmamak için yeterince spesifik.
const ACTIONABLE_TASK_RE =
  /(olu[sş]tur|haz[ıi]rla|tasla[gğ]|\bpitch\b|\btara\b|analiz et|carousel|\bbrief\b|listele|ara[sş]t[ıi]r|g[oö]rev\s+(?:ekle|olu[sş]tur|kaydet)|takip et|kimi aray|i[cç]erik\s+[uü]ret)/i;

function isActionableTask(text: string): boolean {
  const t = text.trim();
  if (t.length < 4) return false;
  return ACTIONABLE_TASK_RE.test(t.toLowerCase());
}

interface DailyV2State {
  date: string;
  day_mode: string;
  agency_load: AgencyLoad;
  energy: EnergyLevel;
  ui_mode: string;
  mode: PlanMode;
  max_auto_tasks: number;
  locked_modules: string[];
  unlocked_modules: string[];
  assistant_reason: string;
  next_action: string;
  today_plan_json: UnifiedTodayPlan | null;
}

type DailyV2Patch = Partial<Omit<DailyV2State, 'date'>>;

/** HTML etiketlerini sök (HTML parse hatası gönderimi düşürdüyse düz-metin retry için). */
function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, '').trim();
}

const GRACEFUL_TR_FALLBACK =
  'Şu an cevabı toparlayamadım Cem — bir hata oldu. Birazdan tekrar yazar mısın?';

interface ReplyKit {
  sendTelegram: (text: string) => Promise<{ ok: boolean; status: number }>;
  reply: (text: string, date: string, intent?: string, agent?: string) => Promise<{ ok: boolean }>;
  replyGuaranteed: (text: string, date: string, intent?: string, agent?: string) => Promise<void>;
  /**
   * Faz 1.6/1.7: teslim edilemeyen zorunlu cevaplar. Boş değilse claim
   * COMPLETE OLAMAZ — route failUpdateClaim + 5xx döner (kullanıcının
   * görmediği cevap başarı sayılmaz).
   */
  undelivered: () => Array<{ seq: number; kind: string }>;
}

/**
 * Faz 0.1 + Sprint-3 Faz 1: bu update'in TÜM cevapları durable delivery
 * ledger'dan geçer. seq deterministiktir (aynı update retry'ında aynı sıra) →
 * aynı cevap provider'a İKİNCİ kez GİTMEZ. v2 kuralları:
 * - deduped yalnız mevcut satır 'sent' ise başarı sayılır (failed/unknown ASLA).
 * - Belirsiz provider sonucu (timeout/5xx) 'unknown' → OTOMATİK ikinci
 *   gönderim YOK (yeni delivery key ile de yok — duplicate riski).
 * - KESİN başarısızlıkta (4xx) stripHtml retry'ına izin var (Telegram işlemedi).
 */
function createReplyKit(updateId: number): ReplyKit {
  let seq = 0;
  const failures: Array<{ seq: number; kind: string }> = [];

  async function sendOnce(text: string): Promise<{
    ok: boolean;
    status: number;
    kind: string;
    seq: number;
    freshlyDelivered: boolean;
  }> {
    seq += 1;
    const mySeq = seq;
    const r = await sendReplyOnce({ updateId, seq: mySeq, text });
    if (!r.countsAsDelivered) {
      failures.push({ seq: mySeq, kind: r.kind });
      console.error('[telegram] reply teslim edilemedi', { seq: mySeq, kind: r.kind, status: r.httpStatus, error: r.error });
    }
    return {
      ok: r.countsAsDelivered,
      status: r.httpStatus,
      kind: r.kind,
      seq: mySeq,
      freshlyDelivered: r.delivered && r.kind !== 'deduped_sent',
    };
  }

  async function reply(text: string, date: string, intent?: string, agent?: string): Promise<{ ok: boolean }> {
    const sent = await sendOnce(text);
    // Yalnız BU çağrıda gerçekten giden mesaj loglanır (dedupe zaten loglanmıştı;
    // teslim edilmeyen mesaj LLM geçmişini kirletmesin).
    if (sent.freshlyDelivered) {
      await logConversationTurn({ date, role: 'assistant', message: text, intent: intent ?? null, agent: agent ?? null });
    }
    return { ok: sent.ok };
  }

  async function replyGuaranteed(text: string, date: string, intent?: string, agent?: string): Promise<void> {
    const primary = (text ?? '').trim();
    const first = await sendOnce(primary || GRACEFUL_TR_FALLBACK);
    if (first.freshlyDelivered) {
      await logConversationTurn({ date, role: 'assistant', message: primary || GRACEFUL_TR_FALLBACK, intent: intent ?? null, agent: agent ?? null });
    }
    if (first.ok || !primary) return;
    // Retry YALNIZ KESİN başarısızlıkta (Telegram işlemediğini söyledi — ör.
    // HTML parse 400). Belirsiz (unknown/in_progress/ledger) sonuçta İKİNCİ
    // provider çağrısı YAPILMAZ: mesaj gitmiş olabilir, duplicate üretmeyiz.
    if (first.kind !== 'failed' && first.kind !== 'unledgered_failed') return;
    const plain = stripHtml(primary) || GRACEFUL_TR_FALLBACK;
    const second = await sendOnce(plain);
    if (second.freshlyDelivered) {
      await logConversationTurn({ date, role: 'assistant', message: plain, intent: intent ? `${intent}_retry` : 'retry', agent: agent ?? null });
    }
    if (second.ok) {
      // Kesin-başarısız ilk deneme retry ile telafi edildi → ilk kaydı düşür.
      const idx = failures.findIndex((f) => f.seq === first.seq);
      if (idx >= 0) failures.splice(idx, 1);
    }
  }

  return {
    sendTelegram: async (text: string) => {
      const r = await sendOnce(text);
      return { ok: r.ok, status: r.status };
    },
    reply,
    replyGuaranteed,
    undelivered: () => [...failures],
  };
}

/** Bugün belirli bir item için kaç kez snooze edildiğini sayar (akıllı snooze). */
async function countTodayDeferrals(date: string): Promise<number> {
  try {
    const { data } = await supabaseAdmin
      .from('assistant_reminders')
      .select('id')
      .eq('date', date)
      .eq('status', 'snoozed');
    return data?.length ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Snooze'u kaydeder. Açık saat verildiyse o güne ait scheduled_at kurar;
 * yoksa relative bir gevşek pencere (1.5 saat) — sabit 2h yerine daha yumuşak.
 */
async function markSnoozed(date: string, originalText: string, timeHint: string | null): Promise<void> {
  let scheduledAt: string;
  if (timeHint && /^\d{2}:\d{2}$/.test(timeHint)) {
    // Istanbul saatini bugünün tarihine sabitle (basit ISO; cron HH:MM ile karşılaştırır).
    scheduledAt = `${date}T${timeHint}:00`;
  } else {
    scheduledAt = new Date(Date.now() + 90 * 60 * 1000).toISOString();
  }

  const { data: lastPending } = await supabaseAdmin
    .from('assistant_reminders')
    .select('id')
    .eq('date', date)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastPending) {
    await supabaseAdmin
      .from('assistant_reminders')
      .update({ status: 'snoozed', scheduled_at: scheduledAt, updated_at: new Date().toISOString() })
      .eq('id', lastPending.id);
  } else {
    try {
      await supabaseAdmin.from('assistant_reminders').insert({
        date,
        reminder_type: 'deferred_task',
        status: 'snoozed',
        scheduled_at: scheduledAt,
        metadata: { original_message: originalText.slice(0, 200), time_hint: timeHint },
      });
    } catch { /* non-critical */ }
  }
}

/** Energy kelimesi mi? (taahhüt akışında ilk soru enerji.) */
function parseEnergyWord(text: string): 'low' | 'medium' | 'high' | null {
  const t = text.toLowerCase().trim();
  if (/^(düşük|dusuk|low|yorgun|bitik)$/.test(t)) return 'low';
  if (/^(orta|medium|idare|normal)$/.test(t)) return 'medium';
  if (/^(yüksek|yuksek|high|enerjik|formda)$/.test(t)) return 'high';
  return null;
}

/**
 * Sabah enerji/ajans cevabından sonra taahhüt döngüsünü ilerletir.
 *
 * Bare enerji kelimeleri ("orta" → set_agency, "düşük" → set_energy) parser
 * tarafından state-intent'lerine yönlenir. Bu yardımcı, henüz bugünün taahhüdü
 * yoksa enerji kalibrasyonunu "bugünün tek kesin işi" sorusuna bağlar.
 *
 * @returns true → taahhüt sorusu gönderildi (handler kendi mesajını ATLAMALI)
 */
async function maybeAdvanceMorningCommitment(date: string, reply: ReplyKit['reply']): Promise<boolean> {
  const existing = await getCommitment(date);
  if (existing) return false; // zaten akıştayız veya taahhüt verilmiş.

  // Sadece sabah check-in canlıyken ilerlet (gün içi /yogun gibi komutları tetikleme).
  try {
    const { data: morning } = await supabaseAdmin
      .from('assistant_reminders')
      .select('status')
      .eq('date', date)
      .eq('reminder_type', 'morning_checkin')
      .maybeSingle();
    if (!morning) return false; // sabah sorusu henüz gitmemiş → taahhüt akışı başlatma.
  } catch {
    return false;
  }

  await setCommitment(date, { commitment: null, status: 'pending', asked_evening: false });
  await reply(
    'Not aldım. Şimdi tek soru: bugünü "iyi geçti" saymak için kesin yapman gereken <b>tek</b> şey ne? Bir cümleyle yaz.',
    date,
    'energy_captured',
  );
  return true;
}

async function getOrCreateDailyState(date: string): Promise<DailyV2State> {
  const { data } = await supabaseAdmin
    .from('daily_v2')
    .select('*')
    .eq('date', date)
    .maybeSingle();
  if (data) {
    return {
      ...data,
      mode: data.ui_mode ?? 'denge'
    };
  }

  const newState = {
    date,
    day_mode: 'normal',
    agency_load: 'normal',
    energy: 'medium',
    ui_mode: 'denge',
    max_auto_tasks: 3,
    locked_modules: [],
    unlocked_modules: [],
    assistant_reason: 'Denge modu aktif. Rutinler ve ana görevler açık.',
    next_action: 'Günlük planına göz at.',
    today_plan_json: null,
  };
  const { data: inserted } = await supabaseAdmin
    .from('daily_v2')
    .insert(newState)
    .select()
    .single();
  const result = inserted ?? newState;
  return {
    ...result,
    mode: result.ui_mode ?? 'denge'
  };
}

async function updateDailyState(date: string, patch: DailyV2Patch): Promise<void> {
  const { data: current } = await supabaseAdmin
    .from('daily_v2')
    .select('*')
    .eq('date', date)
    .maybeSingle();

  const dayMode = patch.day_mode ?? current?.day_mode ?? 'normal';
  const agencyLoad = patch.agency_load ?? current?.agency_load ?? 'normal';
  const energy = patch.energy ?? current?.energy ?? 'medium';

  const policy = await derivePolicyState(dayMode, agencyLoad, energy);

  const payload = {
    date,
    day_mode: dayMode,
    agency_load: agencyLoad,
    energy,
    ...policy,
    ...patch,
    updated_at: new Date().toISOString()
  };

  await supabaseAdmin
    .from('daily_v2')
    .upsert(payload, { onConflict: 'date' });
}

async function buildTodayPlan(
  date: string,
  state: { agency_load: AgencyLoad; energy: EnergyLevel },
): Promise<string> {
  const { data: activeTasks } = await supabaseAdmin
    .from('active_tasks')
    .select('id, title, category, is_priority')
    .order('is_priority', { ascending: false })
    .limit(10);

  const { data: phases } = await supabaseAdmin
    .from('career_phases')
    .select('id, title, is_active');
  const { data: skills } = await supabaseAdmin
    .from('career_skills')
    .select('id, phase_id, title, is_completed')
    .order('sort_order');

  const activePhase = phases?.find(p => p.is_active);
  const activeStep = activePhase
    ? skills?.find(s => s.phase_id === activePhase.id && !s.is_completed) ?? null
    : null;

  const plan = calculateLocalTodayPlan({
    date,
    agencyLoad: state.agency_load,
    energy: state.energy,
    activeTasks: (activeTasks ?? []).filter(t => t.category === 'active'),
    waitingTasks: (activeTasks ?? []).filter(t => t.category === 'waiting'),
    criticalRoutines: [],
    todayRhythms: [],
    healthProtocol: { protocolDay: 1, phase: 'Saldırı', shampoo: null, supplementList: [] },
    financeSnapshot: { hasDebtService: false, haineWarning: false },
    activeBook: null,
    activeGrowthStep: activeStep ? { title: activeStep.title } : null,
  });

  await updateDailyState(date, { today_plan_json: plan, ui_mode: plan.mode });

  const modeLabel: Record<string, string> = { koruma: '🛡 Koruma', denge: '⚖️ Denge', atak: '🚀 Atak' };
  const agencyLabel: Record<string, string> = { low: 'Rahat', normal: 'Normal', high: 'Yoğun' };
  const energyLabel: Record<string, string> = { low: 'Düşük', medium: 'Orta', high: 'Yüksek' };

  const lines = [
    `<b>Feed The Goat — ${date} Planı</b>`,
    `Mod: ${modeLabel[plan.mode] ?? plan.mode} | Ajans: ${agencyLabel[plan.agencyLoad]} | Enerji: ${energyLabel[plan.energy]}`,
    '',
    `<b>Kilit:</b> ${plan.todayLock}`,
    `<b>Maks görev:</b> ${plan.maxActiveTasks}`,
    '',
  ];

  if (plan.priorityTasks.length > 0) {
    lines.push('<b>Öncelikli işler:</b>');
    plan.priorityTasks.forEach((t, i) => lines.push(`${i + 1}. ${t.title}`));
    lines.push('');
  }

  lines.push(`<b>Sağlık:</b> ${plan.health.todaySummary}`);

  if (plan.readingTarget) lines.push(`<b>Okuma:</b> ${plan.readingTarget}`);

  if (plan.financeWarnings.length > 0) {
    lines.push('');
    lines.push(`<b>Finans:</b> ${plan.financeWarnings[0]}`);
  }

  return lines.join('\n');
}

// v2 intent detection is handled by central parseTelegramMessage

async function buildMealSuggestion(): Promise<string> {
  const { data: prefs } = await supabaseAdmin
    .from('assistant_prefs')
    .select('food_likes, food_dislikes, notes')
    .eq('id', 1)
    .maybeSingle();

  const dislikes: string[] = prefs?.food_dislikes ?? [];

  // Pool: [fast option, filling option] — each with dislike tags
  // Protein source candidates
  const fastPool = [
    { label: 'Tavuklu yumurta (10 dk, yüksek protein)', avoids: [] },
    { label: 'Ton balığı + salatalık (5 dk)', avoids: ['ton balığı'] },
    { label: 'Yumurta (haşlanmış, 5 dk)', avoids: [] },
    { label: 'Lor peyniri + ceviz (2 dk)', avoids: ['süt ürünleri'] },
  ];

  const fillingPool = [
    { label: 'Tavuk + yulaf ezmesi (30 dk, tok tutar)', avoids: ['gluten'] },
    { label: 'Yumurta + avokado (protein + sağlıklı yağ)', avoids: [] },
    { label: 'Lor + muz (tok + pratik)', avoids: ['süt ürünleri'] },
    { label: 'Ton balığı + haşlanmış patates (tok tutar)', avoids: ['ton balığı'] },
  ];

  function pickFrom(pool: typeof fastPool): string {
    const valid = pool.filter(o => !o.avoids.some(a => dislikes.some(d => d.includes(a))));
    const chosen = valid.length ? valid[Math.floor(Math.random() * valid.length)] : pool[0];
    return chosen.label;
  }

  const fast = pickFrom(fastPool);
  const filling = pickFrom(fillingPool);

  const lines = [
    '<b>Öğün önerisi:</b>',
    `⚡ En hızlı: ${fast}`,
    `🍽 Daha tok tutan: ${filling}`,
  ];

  if (dislikes.length) lines.push(`<i>Kaçınılanlar gözetildi: ${dislikes.join(', ')}</i>`);

  return lines.join('\n');
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    // Webhook auth: Telegram secret token ZORUNLU (body alanları spoof edilebilir, tek auth budur).
    // setWebhook ... secret_token=<TELEGRAM_WEBHOOK_SECRET> ile eşleşmeli; secret yoksa webhook kapalı.
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!expectedSecret || req.headers.get('x-telegram-bot-api-secret-token') !== expectedSecret) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    // Gövde boyutu sınırı (Faz B3) — dev update'ler reddedilir.
    const rawBody = await req.text();
    if (rawBody.length > MAX_UPDATE_BYTES) {
      return NextResponse.json({ error: 'payload too large' }, { status: 413 });
    }
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'invalid json' }, { status: 400 });
    }
    const parsed = TelegramUpdateSchema.safeParse(parsedJson);
    // Şemaya uymayan veya mesaj-dışı update → güvenli no-op (Telegram retry etmesin diye 200).
    if (!parsed.success) return NextResponse.json({ ok: true, ignored: 'schema' });
    const body = parsed.data;

    const text = body.message?.text;
    if (!text) return NextResponse.json({ ok: true });

    // ── Yetkilendirme (Faz B3) — FAIL-CLOSED: env eksikse veya alan eksikse İŞLENMEZ.
    // Bu blok her türlü DB yazımından ÖNCE gelir (yetkisiz update hiçbir iz bırakmaz).
    const allowedChat = process.env.TELEGRAM_CHAT_ID;
    const allowedUser = process.env.TELEGRAM_USER_ID;
    const incomingChat = body.message?.chat?.id;
    const incomingFrom = body.message?.from?.id;
    if (!allowedChat || incomingChat == null || String(incomingChat) !== allowedChat) {
      return NextResponse.json({ ok: true, ignored: 'chat' });
    }
    if (!allowedUser) {
      // Yapılandırma eksik → fail-closed. (Deploy notu: TELEGRAM_USER_ID zorunlu.)
      console.error('[telegram] TELEGRAM_USER_ID tanımsız — update işlenmedi (fail-closed)');
      return NextResponse.json({ ok: true, ignored: 'user_env' });
    }
    if (incomingFrom == null || String(incomingFrom) !== allowedUser) {
      return NextResponse.json({ ok: true, ignored: 'user' });
    }

    // ── Idempotency (Faz B4 + 0.3): durum makineli claim.
    // duplicate/in_progress → yan etkisiz 200; durable erişilemez (PROD) →
    // 503 FAIL-CLOSED: Telegram update'i SONRA yeniden gönderir (kayıp yok,
    // memory asla "başarılı durable claim" gibi davranmaz).
    const claim = await acquireUpdateClaim(body.update_id);
    if (!claim.acquired) {
      if (claim.reason === 'unavailable') {
        return NextResponse.json({ ok: false, error: 'claim store unavailable' }, { status: 503 });
      }
      return NextResponse.json({ ok: true, deduped: true, reason: claim.reason });
    }

    // Handler gövdesi: başarı → complete (kalıcı no-op); throw → failed
    // (yeniden denenebilir) + 500 → Telegram retry eder, mesaj KAYBOLMAZ.
    // Faz 0.1: complete/fail sonucu AUTHORITATIVE — finalize yazılamadıysa
    // (DB hatası veya fence tutmadı: lease devralındı) 200 DÖNÜLMEZ; Telegram
    // retry eder ve delivery ledger aynı cevabın ikinci kez gitmesini engeller.
    // Sprint-3 Faz 1.6/1.7: cevap TESLİMİ de authoritative — zorunlu cevaplardan
    // biri sent/deduped-sent değilse claim COMPLETE OLMAZ; failed(kesin) →
    // failUpdateClaim + 500 (Telegram retry, delivery ledger duplicate'i engeller);
    // unknown(belirsiz) → yine 500 ama OTOMATİK resend YOK (reconcile insanda).
    const kit = createReplyKit(body.update_id);
    try {
      const response = await handleAuthorizedMessage(kit, body.update_id, String(incomingChat), text);
      const undelivered = kit.undelivered();
      if (undelivered.length > 0) {
        const summary = undelivered.map((u) => `${u.seq}:${u.kind}`).join(',');
        console.error('[telegram] zorunlu cevap teslim edilemedi — claim complete edilmiyor', body.update_id, summary);
        const fail = await failUpdateClaim(claim.fence, `reply undelivered: ${summary}`);
        if (!fail.ok) console.error('[telegram] fail-finalize yazılamadı', body.update_id, fail.reason);
        return NextResponse.json({ ok: false, error: 'reply delivery failed' }, { status: 500 });
      }
      const fin = await completeUpdateClaim(claim.fence);
      if (!fin.ok) {
        console.error('[telegram] claim finalize başarısız', body.update_id, fin.reason);
        return NextResponse.json({ ok: false, error: 'claim finalize failed' }, { status: 500 });
      }
      return response;
    } catch (handlerErr) {
      const fail = await failUpdateClaim(
        claim.fence,
        handlerErr instanceof Error ? handlerErr.message : 'unknown',
      );
      if (!fail.ok) console.error('[telegram] fail-finalize yazılamadı', body.update_id, fail.reason);
      throw handlerErr;
    }
  } catch (error) {
    console.error('Telegram Webhook Error:', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

/**
 * Yetkilendirilmiş + claim'lenmiş mesajın asıl işleyicisi (Faz 0.3 ayrıştırması —
 * claim complete/fail sarmalının tek dönüş noktasından yönetilebilmesi için).
 */
async function handleAuthorizedMessage(
  kit: ReplyKit,
  updateId: number,
  incomingChat: string,
  text: string,
): Promise<NextResponse> {
  {
    // Faz 0.1: bu update'in tüm cevapları ledger'lı at-most-once transporttan.
    const { sendTelegram, reply, replyGuaranteed } = kit;
    const { todayStr: today } = getIstanbulDateAndDay();

    if (!isOrchestratorActive(today)) {
      await sendTelegram(
        `Asistan henüz aktif değil.\nSistem ${process.env.ORCHESTRATOR_START_DATE ?? '2026-06-01'} tarihinde başlıyor.`
      );
      return NextResponse.json({ ok: true });
    }

    // ── SATIŞ KOMUTLARI ÖNCE (Faz B5/B6) ─────────────────────────────────────
    // "cold email hazırla", "Klinik X arandı", "bugün kimi arayayım?" gibi
    // komutlar taahhüt yakalayıcısına veya hayat-intent'lerine ASLA düşmez.
    const salesCmd = parseSalesCommand(text);
    if (salesCmd) {
      await logConversationTurn({ date: today, role: 'user', message: text, intent: `sales:${salesCmd.type}` });
      try {
        const salesReply = await handleSalesCommand(salesCmd, {
          updateId,
          chatKey: incomingChat,
        });
        await replyGuaranteed(salesReply, today, `sales_${salesCmd.type}`);
      } catch (err) {
        console.error('[telegram] sales command failed', err instanceof Error ? err.message : 'unknown');
        await replyGuaranteed('Satış komutu işlenemedi — birazdan tekrar dene.', today, 'sales_error');
      }
      return NextResponse.json({ ok: true });
    }

    // ── "görev ekle" → 1/2 seçimi (TTL'li tek-kullanımlık pending state, Faz B5).
    if (/^[12]$/.test(text.trim())) {
      const pending = await consumePendingAction(incomingChat);
      if (pending?.type === 'add_task_choice') {
        const title = String(pending.payload.title ?? '').trim();
        const category = text.trim() === '1' ? 'active' : 'waiting';
        if (!title) {
          await replyGuaranteed('Görev başlığı kayboldu — "görev ekle: <başlık>" ile yeniden başlat.', today, 'add_task_error');
          return NextResponse.json({ ok: true });
        }
        const { error: taskErr } = await supabaseAdmin.from('active_tasks').insert({ title, category });
        if (taskErr) {
          await replyGuaranteed('Görev kaydedilemedi — tekrar dener misin?', today, 'add_task_error');
        } else {
          await replyGuaranteed(
            `Görev eklendi (${category === 'active' ? 'Aktif görevler' : 'Bekleyenler'}): <b>${title}</b>`,
            today,
            'add_task_done',
          );
        }
        return NextResponse.json({ ok: true });
      }
      // Bekleyen seçim yok veya süresi dolmuş → MUTASYON YOK (belirsiz seçim güvenli no-op).
      await replyGuaranteed(
        'Bekleyen bir seçim yok (süresi dolmuş olabilir). "görev ekle: <başlık>" ile yeniden başlat.',
        today,
        'choice_expired',
      );
      return NextResponse.json({ ok: true });
    }

    // Central parser handles all intents — v2 and legacy
    const intent = parseTelegramMessage(text);

    // Log inbound user turn (multi-turn context for the mentor LLM).
    await logConversationTurn({ date: today, role: 'user', message: text, intent: intent.type });

    // v2: preference learning (passive signal, process before intent dispatch)
    if (intent.type === 'learn_preferences') {
      const signals = extractPrefSignals(intent.raw);
      if (signals.food_likes?.length || signals.food_dislikes?.length || signals.notes) {
        await upsertAssistantPrefs(signals).catch(() => {});
        await sendTelegram('Anladım, not aldım. Bir daha önermem.');
      } else {
        // Unknown preference — fall through to unknown handler
        await sendTelegram(
          'Komutlar:\n' +
            '<b>İş:</b> /bugun /aranacaklar /taslaklar /takipler /sorunlar /pipeline\n' +
            '<b>Hayat:</b> /plan /durum /bonuslar /saglik /finans /kitap /shutdown\n\n' +
            'Satır aksiyonu: "&lt;işletme&gt; arandı / ulaşılamadı / görüşme oldu / daha sonra ara yarın / not: …"\n' +
            'Ya da yaz: "normal", "yoğun", "dağılmış", "tamam", "pas", "ertele", "bugün ne yiyeceğim", "görev ekle: …"'
        );
      }
      return NextResponse.json({ ok: true });
    }

    // Also extract passive pref signals from any message (non-intrusive)
    const passiveSignals = extractPrefSignals(text);
    if (passiveSignals.food_likes?.length || passiveSignals.food_dislikes?.length) {
      await upsertAssistantPrefs(passiveSignals).catch(() => {});
    }

    // v2: day mode
    if (intent.type === 'set_day_mode') {
      const { error } = await supabaseAdmin.from('daily_v2').upsert(
        { date: today, day_mode: intent.mode, updated_at: new Date().toISOString() },
        { onConflict: 'date' }
      );
      if (error) {
        await sendTelegram('Mod kaydedilemedi. Tekrar dene.');
        return NextResponse.json({ ok: true });
      }
      const label = intent.mode === 'normal' ? 'Normal' : intent.mode === 'yogun' ? 'Yoğun' : 'Dağılmış';
      await sendTelegram(`Mod ayarlandı: <b>${label}</b>\nUygulama otomatik güncellendi.`);
      return NextResponse.json({ ok: true });
    }

    // v2: tamam → tamamlandı (+ akşam taahhüt geri-çağırması)
    if (intent.type === 'complete_last_reminder') {
      const { data: reminder } = await supabaseAdmin
        .from('assistant_reminders')
        .select('id')
        .eq('date', today)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (reminder) {
        await supabaseAdmin
          .from('assistant_reminders')
          .update({ status: 'done', updated_at: new Date().toISOString() })
          .eq('id', reminder.id);
      }

      // Akşam yoklamasına "tamam" → taahhüdü done + özel kutlama.
      const commitment = await getCommitment(today);
      if (commitment?.asked_evening && commitment.status === 'pending' && commitment.commitment) {
        await markCommitmentDone(today);
        await reply(await eveningDoneCelebration(commitment.commitment), today, 'commitment_done');
        return NextResponse.json({ ok: true });
      }

      await reply('Helal. Devam et — momentumu koru. 💪', today, 'complete');
      return NextResponse.json({ ok: true });
    }

    // v2: pas / olmadı → skipped (+ akşam taahhüt "olmadı" merak sorusu)
    if (intent.type === 'skip_last_reminder') {
      const { data: reminder } = await supabaseAdmin
        .from('assistant_reminders')
        .select('id')
        .eq('date', today)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (reminder) {
        await supabaseAdmin
          .from('assistant_reminders')
          .update({ status: 'skipped', updated_at: new Date().toISOString() })
          .eq('id', reminder.id);
      }

      // Akşam yoklamasına "olmadı" → blocker'ı sor (tek meraklı soru), taahhüdü missed işaretle.
      const commitment = await getCommitment(today);
      if (commitment?.asked_evening && commitment.status === 'pending') {
        await markCommitmentMissed(today);
        await reply(
          'Sorun değil, sistem bozulmadı. Sadece merak ediyorum: önüne ne çıktı? (tek cümle yeter — yarın ona göre ayarlarız)',
          today,
          'commitment_missed_probe',
        );
        return NextResponse.json({ ok: true });
      }

      await reply('Tamam, geçelim. Yarın tekrar deneriz. Sistem bozulmadı.', today, 'skip');
      return NextResponse.json({ ok: true });
    }

    // mentor: mikro başlangıç onayı ("açtım")
    if (intent.type === 'micro_start_done') {
      await reply(microStartAck(), today, 'micro_start_done');
      return NextResponse.json({ ok: true });
    }

    // mentor: akıllı snooze — açık saatli ("15:00 sor")
    if (intent.type === 'snooze_with_time') {
      const commitment = await getCommitment(today);
      const itemKey = commitment?.commitment ?? text.slice(0, 80);
      const todayDefers = await countTodayDeferrals(today);
      const decision = await decideSnooze(itemKey, todayDefers);

      // Kullanıcı saati verdiyse onu kullan; yoksa kararın mesajını gönder.
      await markSnoozed(today, text, intent.time);
      if (decision.suppressNextNudge) {
        await reply(decision.message, today, 'snooze_suppressed');
      } else {
        await reply(`Tamam, ${intent.time} için not ettim. O saatte tek bir kez sorarım, üstüne gelmem.`, today, 'snooze_timed');
      }
      return NextResponse.json({ ok: true });
    }

    // mentor: akıllı snooze — saatsiz ("ertele")
    if (intent.type === 'snooze_last_reminder') {
      const commitment = await getCommitment(today);
      const itemKey = commitment?.commitment ?? text.slice(0, 80);
      const todayDefers = await countTodayDeferrals(today);
      const decision = await decideSnooze(itemKey, todayDefers);
      await markSnoozed(today, text, null);
      await reply(decision.message, today, `snooze_${decision.deferCount}`);
      return NextResponse.json({ ok: true });
    }

    // v2: öğün sorusu
    if (intent.type === 'meal_question') {
      const msg = await buildMealSuggestion();
      await sendTelegram(msg);
      return NextResponse.json({ ok: true });
    }
    const state = await getOrCreateDailyState(today);

    switch (intent.type) {
      case 'send_plan': {
        const msg = await buildTodayPlan(today, state);
        await sendTelegram(msg);
        break;
      }

      case 'set_state': {
        await updateDailyState(today, { agency_load: intent.agencyLoad, energy: intent.energy });
        const updated: AssistantDailyState = { ...state, agency_load: intent.agencyLoad, energy: intent.energy };
        const msg = await buildTodayPlan(today, updated);
        await sendTelegram(msg);
        break;
      }

      case 'set_agency': {
        await updateDailyState(today, { agency_load: intent.agencyLoad });
        // Sabah taahhüt akışı: enerji/ajans cevabı → "tek kesin iş" sorusu.
        if (await maybeAdvanceMorningCommitment(today, reply)) break;
        const agencyLabel: Record<string, string> = { low: 'Rahat', normal: 'Normal', high: 'Yoğun' };
        await reply(`Ajans yoğunluğu güncellendi: ${agencyLabel[intent.agencyLoad]}`, today, 'set_agency');
        break;
      }

      case 'set_energy': {
        await updateDailyState(today, { energy: intent.energy });
        // Sabah taahhüt akışı: enerji cevabı → "tek kesin iş" sorusu.
        if (await maybeAdvanceMorningCommitment(today, reply)) break;
        const energyLabel: Record<string, string> = { low: 'Düşük', medium: 'Orta', high: 'Yüksek' };
        await reply(`Enerji seviyesi güncellendi: ${energyLabel[intent.energy]}`, today, 'set_energy');
        break;
      }

      case 'simplify': {
        await updateDailyState(today, { agency_load: 'high', energy: 'low', mode: 'koruma' });
        await sendTelegram('Sadeleştirme moduna geçildi. 1 ana iş + rutinler. Yeni görev ekleme.');
        break;
      }

      case 'send_rhythms': {
        const dow = new Date().getDay();
        const dayBonuses: Record<number, string> = {
          1: '<b>Pazartesi bonusları:</b>\n- İngilizce: Günlük kelime (20 dk)\n- Antrenman: Upper A',
          2: '<b>Salı bonusları:</b>\n- İngilizce: Ana ders (35–45 dk)\n- Antrenman: Lower A',
          3: '<b>Çarşamba bonusları:</b>\n- İngilizce: Dinleme + shadowing (25 dk)\n- Antrenman: Kondisyon + Core + Havuz',
          4: '<b>Perşembe bonusları:</b>\n- İngilizce: Writing (30 dk)\n- Antrenman: Upper B',
          5: '<b>Cuma bonusları:</b>\n- İngilizce: Kelime tekrar (20–25 dk)\n- Antrenman: Lower B',
          6: '<b>Cumartesi bonusları:</b>\n- İngilizce: Hafif okuma / dinleme (20 dk)\n- Antrenman: Lower B + Metabolik',
          0: '<b>Pazar bonusları:</b>\n- İngilizce: Haftalık tekrar + mini konuşma (35–45 dk)',
        };
        await sendTelegram(dayBonuses[dow] ?? 'Bugün bonus bilgisi yok.');
        break;
      }

      case 'send_health': {
        await sendTelegram(
          '<b>Sağlık minimumu:</b>\n✓ Proteinli ilk öğün\n✓ 3 litre su\n✓ 35 dk yürüyüş / koşu bandı'
        );
        break;
      }

      case 'send_finance': {
        await sendTelegram(
          '<b>Finans notu:</b>\nBugün yeni taksit yok. Yeni SaaS yok.\nKural: Yeni borç yok. Yeni taksit yok.'
        );
        break;
      }

      case 'send_book': {
        await sendTelegram(
          '<b>Okuma hedefi:</b>\nBugünkü hedef: 10 sayfa.\nEnerji düşükse: 5 sayfa yeterli.'
        );
        break;
      }

      case 'send_shutdown': {
        await sendTelegram(
          'Günü kapatalım Cem.\n1) En kritik görevi bitirdin mi?\n2) Sağlık minimumu tamam mı?\n3) Yarın ilk hamle ne?'
        );
        break;
      }

      case 'send_status': {
        const { data: v2 } = await supabaseAdmin
          .from('daily_v2')
          .select('day_mode, protein_meal, water_3l, walk_35')
          .eq('date', today)
          .maybeSingle();
        const modeLabel: Record<string, string> = { normal: 'Normal', yogun: 'Yoğun', dagilmis: 'Dağılmış' };
        const mode = v2?.day_mode ? (modeLabel[v2.day_mode] ?? v2.day_mode) : 'Seçilmedi';
        await sendTelegram(
          `<b>Bugünkü durum — ${today}</b>\nMod: ${mode}\nProtein: ${v2?.protein_meal ? '✓' : '·'} Su: ${v2?.water_3l ? '✓' : '·'} Yürüyüş: ${v2?.walk_35 ? '✓' : '·'}`
        );
        break;
      }

      case 'add_task_draft': {
        // TTL'li pending state — "1"/"2" cevabı yukarıdaki seçim bloğunda tamamlanır (Faz B5).
        await setPendingAction(incomingChat, 'add_task_choice', { title: intent.title });
        await sendTelegram(
          `Görevi nereye ekleyeyim?\n"${intent.title}"\n\n1) Aktif görevler\n2) Bekleyenler\n\nCevapla: 1 veya 2 (10 dk geçerli)`
        );
        break;
      }

      default: {
        // ── Intent guard + taahhüt döngüsü (sabah) + LLM serbest-metin fallback ──
        const commitment = await getCommitment(today);
        const msgIntent = classifyMessageIntent(text);

        // Meta/yetenek sorusu → deterministik yanıt; taahhüt akışını ASLA tetikleme.
        if (msgIntent === 'meta') {
          await reply(capabilitiesReply(), today, 'meta');
          break;
        }

        // ── Eylemsel görev / üretim isteği → Jarvis (Faz B5: taahhüt yakalayıcısından
        // ÖNCE — "içerik üret", "araştır" gibi komutlar taahhüt olarak KAYDEDİLMEZ).
        if (isActionableTask(text)) {
          try {
            const { reply: jReply } = await runJarvis(text);
            await replyGuaranteed(jReply || GRACEFUL_TR_FALLBACK, today, 'jarvis');
          } catch (err) {
            console.error('[telegram] jarvis failed', err);
            await replyGuaranteed(GRACEFUL_TR_FALLBACK, today, 'jarvis_error');
          }
          break;
        }

        // 3. adım: taahhüt var, saat yok → bu mesaj saat cevabı OLABİLİR.
        // Yalnızca gerçek saat/taahhüt cümlesi yakala; selam/soru/sohbet garbage do_at olmasın.
        if (commitment && commitment.commitment && !commitment.do_at && !commitment.asked_evening) {
          const th = parseTimeHint(text);
          if (th || msgIntent === 'commitment_candidate') {
            const timeHint = th ?? text.trim().slice(0, 40);
            await setCommitment(today, { do_at: timeHint });
            await reply(commitmentSetConfirmation(commitment.commitment, timeHint), today, 'commitment_time_set');
            break;
          }
          // saat/taahhüt değil → akışı bozmadan aşağıdaki mentor yoluna düş.
        }

        // 2. adım: placeholder var, taahhüt yok → bu mesaj taahhüt OLABİLİR.
        // GUARD: yalnızca gerçek taahhüt cümlesi yakalanır. Selam/soru/sohbet taahhüt OLMAZ
        // ("Selam" → taahhüt sanma bug'ının kökü buydu).
        if (commitment && !commitment.commitment && !commitment.asked_evening && msgIntent === 'commitment_candidate') {
          const commitmentText = text.trim().slice(0, 200);
          await setCommitment(today, { commitment: commitmentText, status: 'pending' });
          await reply(commitmentTimeQuestion(commitmentText), today, 'commitment_captured');
          break;
        }

        // 1. adım: taahhüt satırı yok ve mesaj bir enerji kelimesi → sabah enerji cevabı.
        const energyWord = parseEnergyWord(text);
        if (!commitment && energyWord) {
          await updateDailyState(today, { energy: energyWord });
          // morning check-in canlıysa taahhüt sorusuna ilerle (gated).
          if (await maybeAdvanceMorningCommitment(today, reply)) break;
        }

        // ── Akıllı yönlendirme: hayat (hızlı mentor) vs iş (çok-ajanlı kurul) ──
        // Tüm yol iç try/catch'te: bir throw'da bile kullanıcı MUTLAKA cevap alır.
        const { data: v2state } = await supabaseAdmin
          .from('daily_v2')
          .select('energy')
          .eq('date', today)
          .maybeSingle();
        const energyLevel =
          v2state?.energy === 'low' ? 'LOW' : v2state?.energy === 'high' ? 'HIGH' : 'NORMAL';

        try {
          const history = await getRecentConversation(10);
          const { route } = await classifyQuestion(text, history);

          if (route === 'business_deliberate') {
            const { reply: bizReply } = await deliberateBusiness(text, history);
            await replyGuaranteed(bizReply, today, 'biz_deliberation');
          } else {
            const { reply: llmReply, agent } = await runMentorFreeText(text, { energyLevel });
            await replyGuaranteed(llmReply, today, 'llm_freetext', agent);
          }
        } catch (err) {
          console.error('[telegram] free-text routing failed', err);
          await replyGuaranteed(GRACEFUL_TR_FALLBACK, today, 'freetext_error');
        }
        break;
      }
    }

    return NextResponse.json({ ok: true });
  }
}
