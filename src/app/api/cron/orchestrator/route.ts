import { NextResponse } from 'next/server';
import { lifeSupabaseAdmin as supabaseAdmin } from '@/lib/lifeSupabaseAdmin';
import { isOrchestratorActive } from '@/data/orchestratorConfig';

// Proaktif mesaj LLM üretimi yavaş (deepseek reasoning) — cron'a 60s tanı.
export const maxDuration = 60;
import { getDueReminder } from '@/lib/reminderEngine';
import { calculateLocalTodayPlan } from '@/lib/dailyOrchestrator';
import type { ReminderType } from '@/data/orchestratorConfig';
import type { AssistantDailyState } from '@/lib/dailyOrchestrator';
import { getIstanbulDateAndDay } from '@/lib/assistant/timezone';
import { getCommitment, setCommitment, logConversationTurn } from '@/lib/assistant/memory';
import { morningCommitmentQuestion, eveningRecallQuestion, sanitizeForTelegram } from '@/lib/assistant/mentorLoop';
import { loadAssistantLiveContext, type AssistantLiveContext } from '@/lib/assistant/liveContext';
import { buildMentorSystemPrompt } from '@/lib/assistant/prompts';
import { callOpenRouter } from '@/lib/assistant/llm';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID ?? '';

async function sendTelegram(text: string): Promise<number | null> {
  if (!BOT_TOKEN || !CHAT_ID) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML' }),
    });
    const data = await res.json() as { ok: boolean; result?: { message_id: number } };
    return data?.result?.message_id ?? null;
  } catch {
    return null;
  }
}

async function getOrCreateDailyState(date: string): Promise<any> {
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

/**
 * Proaktif hatırlatmayı Cem'in O ANKİ gerçek verisine dayalı, varyasyonlu üretir.
 * LLM null/boş dönerse VERİLEN sabit fallback'e düşer (asla boş mesaj gitmez).
 * Sınırlar (otomatik gönderim yok, suçlama yok) buildMentorSystemPrompt içindeki
 * MENTOR_HARD_RULES ile korunur.
 */
async function generateReminderMessage(
  purpose: string,
  live: AssistantLiveContext,
  fallback: string,
): Promise<string> {
  try {
    const system = await buildMentorSystemPrompt('mentor', live.promptContext, {
      includeMemory: true,
      channel: 'telegram',
    });
    const full = `${system}\n\n${live.factsBlock}`;
    const reply = await callOpenRouter(
      [
        { role: 'system', content: full },
        {
          role: 'user',
          content:
            `Şu an Cem'e PROAKTİF bir hatırlatma gönderiyorsun (Cem sormadı). Amaç: ${purpose}. ` +
            `Yukarıdaki "GERÇEK VERİ" bloğuna (rutin tikleri, sağlık minimumu, aktif görevler, günün odağı) ` +
            `somut değin; bugüne özel konuş, genel geçer şablon kurma. Tek mesaj, kısa (1-3 cümle), sıcak, ` +
            `tekrara düşmeyen. Suçlama yok.`,
        },
      ],
      { maxTokens: 320, temperature: 0.7 },
    );
    const text = reply?.trim();
    return text && text.length > 0 ? sanitizeForTelegram(text) : fallback;
  } catch {
    return fallback;
  }
}

async function buildReminderMessage(
  type: ReminderType,
  date: string,
  state: AssistantDailyState,
  live: AssistantLiveContext,
): Promise<string> {
  const { dow } = getIstanbulDateAndDay();

  if (type === 'morning_checkin') {
    // İki yönlü taahhüt döngüsü: enerji + "bugünkü tek kesin iş" sorusu.
    // Webhook bu soruyu parse eder — YAPISAL, LLM'e devredilmez.
    return morningCommitmentQuestion();
  }

  if (type === 'midday_status') {
    // Taahhüt verildiyse yapısal yoklama (webhook 'tamam/ertele/takıldım' parse eder) — korunur.
    const commitment = await getCommitment(date);
    if (commitment?.commitment && commitment.status === 'pending') {
      return `Cem, gün ortası. Sabah dediğin tek iş: <b>${commitment.commitment}</b>${commitment.do_at ? ` (${commitment.do_at})` : ''}. Yolunda mı?\nCevapla: tamam / ertele / takıldım`;
    }
    const fallback = `Cem, gün ortası kontrol.\nSağlık minimumu yolunda mı (protein öğün, su, yürüyüş)?\nCevapla: tamam / pas`;
    return generateReminderMessage(
      'gün ortası sağlık ve odak yoklaması (protein öğün, su, yürüyüş + günün ana işi)',
      live,
      fallback,
    );
  }

  if (type === 'night_shutdown') {
    // Akşam geri-çağırma: sabah taahhüdü yapısal yoklama (webhook parse eder) — korunur.
    const commitment = await getCommitment(date);
    if (commitment?.commitment && commitment.status === 'pending' && !commitment.asked_evening) {
      await setCommitment(date, { asked_evening: true });
      return eveningRecallQuestion(commitment.commitment);
    }
    const healthLine = `Proteinli ilk öğün, 3 litre su, 35 dk yürüyüş / koşu bandı`;
    const fallback = `Günü kapatalım Cem.\n\n<b>Sağlık:</b> ${healthLine}\n\n1) Bugün en kritik görevi bitirdin mi?\n2) Sağlık minimumu tamam mı?\n3) Yarın ilk hamle ne?`;
    return generateReminderMessage(
      'günü sakin kapatma: bugünkü kritik iş + sağlık minimumu durumu + yarının ilk hamlesi. Sistemi bozmadığını hissettir, suçlama yok.',
      live,
      fallback,
    );
  }

  if (type === 'evening_rhythm') {
    const dayRhythms: Record<number, string> = {
      1: '- İngilizce günlük kelime (8–10 kelime)\n- Antrenman: Upper A',
      2: '- İngilizce Mikro Temas (Fielse, 5–8 kelime)\n- Koşu bandı 20 dk\n- Antrenman: Lower A',
      3: '- İngilizce: Dinleme + shadowing (25 dk)',
      4: '- İngilizce Ana Çalışma (40–60 dk)\n- Koşu bandı 20 dk\n- Antrenman: Upper B',
      5: '- İngilizce günlük kelime\n- Antrenman: Upper B (80–95 dk)',
      6: '- İngilizce: Hafif okuma / dinleme (20 dk)\n- Antrenman: Lower B',
      0: '- İngilizce: Haftalık tekrar + mini konuşma (35–45 dk)',
    };
    const rhythmDetail = dayRhythms[dow] ?? 'Bugün programlanmış ritim yok.';
    const energyNote = state.energy === 'low' ? '\n\nEnerji düşük — minimum versiyon yeterli.' : '';
    const fallback = `<b>Akşam ritimleri:</b>\n${rhythmDetail}${energyNote}`;
    return generateReminderMessage(
      `akşam ritimlerini hatırlatma. Bugünün ritim kalemleri (BUNLARI AYNEN KORU, ekleme/çıkarma yapma):\n${rhythmDetail}`,
      live,
      fallback,
    );
  }

  return '';
}

export async function GET(req: Request): Promise<NextResponse> {
  // v2: CRON_SECRET — Authorization: Bearer header-first (Vercel crons).
  // Query string ?secret= accepted in dev only.
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const querySecret = new URL(req.url).searchParams.get('secret');
  const isProd = process.env.NODE_ENV === 'production';

  const isAuthorized =
    (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
    (!isProd && cronSecret && querySecret === cronSecret) ||
    (!isProd && !cronSecret); // local dev without secret

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Istanbul tarihi — webhook de getIstanbulDateAndDay kullanıyor. UTC kullanılırsa
  // 00:00-03:00 arası cron ile webhook farklı gün anahtarına yazıp taahhüt/reminder split olur.
  const { todayStr: today } = getIstanbulDateAndDay();

  if (!isOrchestratorActive(today)) {
    return NextResponse.json({ ok: true, message: 'Orchestrator not active yet', startDate: process.env.ORCHESTRATOR_START_DATE });
  }

  // Get already-sent reminders for today
  const { data: sentRows } = await supabaseAdmin
    .from('assistant_reminders')
    .select('reminder_type')
    .eq('date', today);

  const sentToday = (sentRows ?? []).map(r => r.reminder_type as ReminderType);
  const due = getDueReminder(new Date(), sentToday);

  if (!due) {
    return NextResponse.json({ ok: true, message: 'No reminder due right now', sentToday });
  }

  const state = await getOrCreateDailyState(today);

  // Build plan if not already done for morning check-in
  if (due === 'morning_checkin' && !state.today_plan_json) {
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
      date: today,
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

    await supabaseAdmin
      .from('daily_v2')
      .upsert({ date: today, today_plan_json: plan, updated_at: new Date().toISOString() }, { onConflict: 'date' });
  }

  // Cem'in anlık gerçek verisini cron'un service-role client'ı ile yükle
  // (createServerSupabase cron'da cookie bulamaz → supabaseAdmin geçilir).
  const timeOfDay =
    due === 'midday_status' ? 'ÖĞLEN'
    : due === 'evening_rhythm' ? 'AKŞAM'
    : due === 'night_shutdown' ? 'GECE'
    : 'SABAH';
  const live = await loadAssistantLiveContext({
    client: supabaseAdmin,
    energyLevel: state.energy === 'low' ? 'LOW' : state.energy === 'high' ? 'HIGH' : 'NORMAL',
    timeOfDay,
  });

  const message = await buildReminderMessage(due, today, state, live);
  if (!message) {
    // Bilinmeyen reminder tipi boş mesaj üretti — boş gönderme (Telegram 400) ve
    // reminder'ı "gönderildi" diye işaretleme.
    return NextResponse.json({ ok: true, message: 'Empty reminder, skipped', due });
  }
  const messageId = await sendTelegram(message);
  // Log outbound reminder so the mentor LLM has full two-way context.
  if (message) {
    await logConversationTurn({ date: today, role: 'assistant', message, intent: due });
  }

  // Record the sent reminder
  await supabaseAdmin.from('assistant_reminders').upsert(
    {
      date: today,
      reminder_type: due,
      sent_at: new Date().toISOString(),
      // 'pending' = gönderildi, kullanıcı cevabı bekleniyor. Webhook tamam/pas/ertele
      // bu statüyü sorgular; 'sent' olduğunda hiç eşleşmiyordu (reminder lifecycle bug).
      status: 'pending',
      telegram_message_id: messageId,
    },
    { onConflict: 'date,reminder_type' }
  );

  return NextResponse.json({ ok: true, sent: due, messageId });
}
