// ─────────────────────────────────────────────────────────────────────────────
// Sabah brifingi — Cem kalkınca tek mesajda görmesi gerekenler:
//   1) Aktif görev özeti (LIFE DB: active_tasks)
//   2) Bugünün önerilen işleri (zaten hesaplanan plan.priorityTasks)
//   3) Bugün aranacak müşteriler + iletişim (AgencyOS DB: getCallableCustomers)
//
// Tamamı best-effort: hiçbir alt blok throw etmez. Brifing patlasa bile
// sabah mesajı (enerji/taahhüt sorusu) yine gönderilir — orchestrator akışı korunur.
// ─────────────────────────────────────────────────────────────────────────────
import { lifeSupabaseAdmin } from '@/lib/lifeSupabaseAdmin';
import { getCallableCustomers } from '@/lib/assistant/agencyContext';
import { escapeTelegramHtml } from '@/lib/telegramHtml';
import type { UnifiedTodayPlan } from '@/lib/dailyOrchestrator';

const MAX_TASK_LINES = 5;
const MAX_SUGGESTIONS = 3;
const MAX_CUSTOMERS = 4;

interface ActiveTaskRow {
  title: string | null;
  category: string | null;
  is_done: boolean | null;
  is_priority: boolean | null;
}

/** Aktif (açık) görevlerin özeti: toplam sayı + ilk birkaç başlık. */
async function buildActiveTasksBlock(): Promise<string | null> {
  try {
    const { data } = await lifeSupabaseAdmin
      .from('active_tasks')
      .select('title, category, is_done, is_priority')
      .eq('category', 'active')
      .eq('is_done', false)
      .order('is_priority', { ascending: false })
      .order('sort_order', { ascending: true })
      .limit(20);

    const rows = (data ?? []) as ActiveTaskRow[];
    if (rows.length === 0) return null;

    const lines = [`<b>📋 Aktif görevler (${rows.length})</b>`];
    for (const r of rows.slice(0, MAX_TASK_LINES)) {
      const flag = r.is_priority ? '⭐ ' : '• ';
      lines.push(`${flag}${escapeTelegramHtml(r.title ?? '(başlıksız)')}`);
    }
    if (rows.length > MAX_TASK_LINES) {
      lines.push(`<i>…+${rows.length - MAX_TASK_LINES} görev daha</i>`);
    }
    return lines.join('\n');
  } catch {
    return null;
  }
}

/** Önerilen işler — plan zaten hesapladı (calculateLocalTodayPlan). Yeniden hesaplama yok. */
function buildSuggestionsBlock(plan: UnifiedTodayPlan | null): string | null {
  const tasks = plan?.priorityTasks ?? [];
  if (tasks.length === 0) return null;
  const lines = ['<b>🎯 Bugün öneriler</b>'];
  tasks.slice(0, MAX_SUGGESTIONS).forEach((t, i) => {
    lines.push(`${i + 1}. ${escapeTelegramHtml(t.title)}`);
  });
  return lines.join('\n');
}

/** Bugün aranacak müşteriler — AgencyOS DB, iletişim bilgisiyle. */
async function buildCustomersBlock(): Promise<string | null> {
  try {
    const customers = await getCallableCustomers(MAX_CUSTOMERS);
    if (customers.length === 0) return null;
    const lines = ['<b>📞 Bugün aranacak</b>'];
    for (const c of customers) {
      const loc = c.loc ? ` <i>(${escapeTelegramHtml(c.loc)})</i>` : '';
      const contact = c.contact ? ` — ${escapeTelegramHtml(c.contact)}` : '';
      lines.push(`• <b>${escapeTelegramHtml(c.name)}</b>${loc} — skor ${c.score}${contact}`);
    }
    return lines.join('\n');
  } catch {
    return null;
  }
}

/**
 * Sabah brifing bloğunu üretir (HTML, Telegram parse_mode uyumlu).
 * Boş alt bloklar atlanır. Hiçbir veri yoksa boş string döner — çağıran taraf
 * boş brifingi sorunun önüne koymadan atlayabilir.
 */
export async function buildMorningBriefingBlock(args: {
  plan: UnifiedTodayPlan | null;
}): Promise<string> {
  const [tasksBlock, customersBlock] = await Promise.all([
    buildActiveTasksBlock(),
    buildCustomersBlock(),
  ]);
  const suggestionsBlock = buildSuggestionsBlock(args.plan);

  const blocks = [tasksBlock, suggestionsBlock, customersBlock].filter(
    (b): b is string => Boolean(b && b.trim()),
  );
  return blocks.join('\n\n');
}
