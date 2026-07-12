import { NextResponse } from 'next/server';
import { lifeSupabaseAdmin as supabaseAdmin } from '@/lib/lifeSupabaseAdmin';
import { isOrchestratorActive } from '@/data/orchestratorConfig';
import { getIstanbulDateAndDay } from '@/lib/assistant/timezone';
import { buildMentorSystemPrompt } from '@/lib/assistant/prompts';
import { sanitizeForTelegram } from '@/lib/assistant/mentorLoop';
import { callOpenRouter } from '@/lib/assistant/llm';

// Haftalık retro — Cem'in son 7 gününü (taahhütler + tekrarlayan temalar) değerlendirir,
// pozitif psikoloji + GROW ile sıcak özet + gelecek hafta TEK odak önerir. Pazar akşamı.
export const maxDuration = 60;

import { dispatchReminder } from '@/lib/assistant/reminderDispatch';

function isAuthorized(req: Request): boolean {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const querySecret = new URL(req.url).searchParams.get('secret');
  const isProd = process.env.NODE_ENV === 'production';
  return Boolean(
    (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
      (!isProd && cronSecret && querySecret === cronSecret) ||
      (!isProd && !cronSecret),
  );
}

interface ThemeRow { kind: string; key: string | null; value: unknown; occurrences: number }
interface CommitmentRow { commitment: string | null; status: string | null }

/** Son 7 günün veri bloğunu (taahhütler + tekrarlayan temalar) üretir. */
async function buildRetroData(today: string): Promise<string> {
  const lines: string[] = [];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // Taahhütler (son 7 gün)
  try {
    const { data } = await supabaseAdmin
      .from('daily_commitments')
      .select('commitment, status')
      .gte('date', weekAgo);
    const rows = (data ?? []) as CommitmentRow[];
    const done = rows.filter((r) => r.status === 'done').length;
    const missed = rows.filter((r) => r.status === 'missed').length;
    lines.push(`Taahhütler (7 gün): ${done} tamam, ${missed} olmadı, ${rows.length} toplam.`);
    const doneList = rows.filter((r) => r.status === 'done' && r.commitment).slice(0, 5);
    if (doneList.length) lines.push(`Tutulan sözler: ${doneList.map((r) => r.commitment).join('; ')}`);
  } catch { /* best-effort */ }

  // Tekrarlayan temalar / kazançlar / desenler (mentor_memory)
  try {
    const { data } = await supabaseAdmin
      .from('mentor_memory')
      .select('kind, key, value, occurrences')
      .order('occurrences', { ascending: false })
      .limit(12);
    const rows = (data ?? []) as ThemeRow[];
    const themes = rows.filter((r) => (r.key ?? '').startsWith('tema:'));
    const wins = rows.filter((r) => r.kind === 'win');
    if (themes.length) {
      lines.push(
        `Tekrarlayan temalar: ${themes.map((t) => `${(t.key ?? '').replace('tema:', '')}(${t.occurrences}x)`).join(', ')}`,
      );
    }
    if (wins.length) lines.push(`Kazançlar: ${wins.map((w) => w.key).filter(Boolean).slice(0, 5).join('; ')}`);
  } catch { /* best-effort */ }

  return lines.length ? lines.join('\n') : 'Bu hafta için yeterli veri yok.';
}

export async function GET(req: Request): Promise<NextResponse> {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { todayStr: today } = getIstanbulDateAndDay();
  if (!isOrchestratorActive(today)) {
    return NextResponse.json({ ok: true, message: 'Orchestrator not active yet' });
  }

  // İdempotent: bu hafta GERÇEKTEN gönderildiyse atla. send_failed satır blokE ETMEZ
  // (Faz B2 — başarısız deneme retry hakkını kilitleyemez).
  try {
    const { data: existing } = await supabaseAdmin
      .from('assistant_reminders')
      .select('id, status')
      .eq('date', today)
      .eq('reminder_type', 'weekly_retro')
      .maybeSingle();
    if (existing && existing.status !== 'send_failed') {
      return NextResponse.json({ ok: true, message: 'Already sent this week' });
    }
  } catch { /* devam */ }

  const dataBlock = await buildRetroData(today);

  let message = '';
  try {
    const system = await buildMentorSystemPrompt('mentor', undefined, {
      includeMemory: true,
      channel: 'telegram',
    });
    const raw = await callOpenRouter(
      [
        { role: 'system', content: system },
        {
          role: 'user',
          content:
            `Cem'e PROAKTİF haftalık retro gönderiyorsun (Pazar akşamı). Aşağıdaki son 7 gün verisine ` +
            `SOMUT değin. Pozitif psikoloji: kazançları ve tutulan sözleri görünür kıl, kutla (abartma). ` +
            `Tekrarlayan temalar varsa nazikçe, yargısız adlandır. Sonunda GROW ile gelecek hafta için ` +
            `TEK net odak öner. Sıcak, kısa (4-6 cümle), suçlama yok.\n\n=== SON 7 GÜN VERİSİ ===\n${dataBlock}`,
        },
      ],
      { maxTokens: 420, temperature: 0.7 },
    );
    message = (raw ?? '').trim();
    if (message) message = sanitizeForTelegram(message);
  } catch { /* fallback altta */ }

  if (!message) {
    message =
      'Haftalık retro Cem. 🗓\nBu haftayı kapatıyoruz — sistemi bozmadığın her gün kazanç. ' +
      'Gelecek hafta için tek odak seç: en yüksek kaldıraçlı işin ne? Onu pazartesi ilk işe koy.';
  }

  // Faz B2: message_id yoksa "gönderildi" yok — aynı kural weekly retro için de geçerli.
  const result = await dispatchReminder({
    date: today,
    reminderType: 'weekly_retro',
    message,
    successStatus: 'done',
  });

  if (!result.sent) {
    return NextResponse.json(
      { ok: false, error: result.error, attempts: result.attempts },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, sent: 'weekly_retro', messageId: result.messageId });
}
