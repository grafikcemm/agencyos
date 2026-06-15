// ─────────────────────────────────────────────────────────────────────────────
// Mentor Action-Loop — iki yönlü, uyarlanır Telegram mentörünün motoru.
//
// Sorumluluklar:
//   - LLM serbest-metin fallback (brain + konuşma geçmişi + bellek → doğal cevap)
//   - Akıllı snooze (sabit 2 saat YOK; 1. erteleme kabul, 2. aynı şey → kalıp sorusu,
//     3. aynı gün dürtme YOK)
//   - Sabah taahhüt çıkarma / akşam geri-çağırma yardımcı metinleri
//   - 5-dk mikro başlangıç
//
// Mevcut OpenRouter client + reminder lifecycle KORUNUR.
// ─────────────────────────────────────────────────────────────────────────────
import { callOpenRouter } from "@/lib/assistant/llm";
import { buildMentorSystemPrompt } from "./prompts";
import { loadAssistantLiveContext } from "./liveContext";
import type { AgentType } from "./agents";
import { routeMessageToAgent } from "./agents";
import {
  getRecentConversation,
  recordMemory,
  getMemoryOccurrences,
} from "./memory";

// Telegram için markdown→HTML temizliği (notifications route ile aynı davranış).
export function sanitizeForTelegram(raw: string): string {
  const sanitized = raw
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/\*(.+?)\*/g, "<i>$1</i>")
    .replace(/_(.+?)_/g, "<i>$1</i>")
    .replace(/`(.+?)`/g, "$1");
  // Eşlenmemiş markdown sembolleri kaldıysa düz metne düş.
  if (/\*\*|\*|_/g.test(sanitized)) {
    return raw.replace(/[*_`]/g, "");
  }
  return sanitized;
}

export interface FreeTextResult {
  reply: string;
  agent: AgentType;
}

/**
 * Serbest metni mentör LLM'ine yönlendirir.
 *
 * - Sistem prompt: brain (knowledge/) + hard rules + öğrenilen bellek + telegram kanalı notu
 * - Geçmiş: telegram_conversations'tan son N tur (çok-turlu pazarlık/takip)
 * - Çıktı: doğal, kısa Türkçe cevap (pazarlık, öğün önerisi, itiraz karşılama…)
 *
 * LLM null dönerse güvenli, sınırları ihlal etmeyen statik bir cevaba düşer.
 */
export async function runMentorFreeText(
  userText: string,
  opts?: { energyLevel?: "LOW" | "NORMAL" | "HIGH"; timeOfDay?: "SABAH" | "ÖĞLEN" | "AKŞAM" | "GECE" },
): Promise<FreeTextResult> {
  const agent = routeMessageToAgent(userText);

  // Cem'in anlık gerçek verisini yükle (rutin/skor/görev/sağlık/finans) ve
  // hem prompt makinesine hem de okunur "GERÇEK VERİ" bloğu olarak LLM'e ver.
  // Eski davranış burada sıfır context geçiyordu → genel/şablon cevap.
  let systemPrompt = "";
  let factsBlock = "";
  try {
    const live = await loadAssistantLiveContext({
      energyLevel: opts?.energyLevel,
      timeOfDay: opts?.timeOfDay,
    });
    factsBlock = live.factsBlock;
    systemPrompt = await buildMentorSystemPrompt(
      agent,
      live.promptContext,
      { includeMemory: true, channel: "telegram" },
    );
  } catch {
    systemPrompt = "";
  }

  const fullSystem = factsBlock ? `${systemPrompt}\n\n${factsBlock}` : systemPrompt;

  // Geçmiş bağlam (eski→yeni).
  const history = await getRecentConversation(10);
  const historyMessages = history.map((t) => ({
    role: t.role === "assistant" ? ("assistant" as const) : ("user" as const),
    content: t.message,
  }));

  let reply: string | null = null;
  if (systemPrompt) {
    try {
      reply = await callOpenRouter(
        [
          { role: "system", content: fullSystem },
          ...historyMessages,
          { role: "user", content: userText },
        ],
        { maxTokens: 600, temperature: 0.6 },
      );
    } catch {
      reply = null;
    }
  }

  const safe =
    reply && reply.trim().length > 0
      ? sanitizeForTelegram(reply.trim())
      : "Anladım Cem. Şu an net bir öneri toparlayamadım ama kuralı biliyorsun: bugün minimum gün de sayılır — Spor + 1 üretim görevi + uygulamayı aç. Bunlardan birine ufak bir adım atalım mı?";

  return { reply: safe, agent };
}

// ── Akıllı snooze ────────────────────────────────────────────────────────────

export interface SnoozeDecision {
  /** Mentörün vereceği mesaj. */
  message: string;
  /** Aynı item bugün kaç kez ertelendi (bu erteleme dahil). */
  deferCount: number;
  /** 3. kez aynı gün → artık dürtme. */
  suppressNextNudge: boolean;
  /** Birden çok gün boyunca kalıp oluştuysa kalıp adı sorulmalı. */
  shouldNamePattern: boolean;
}

/**
 * Akıllı snooze kararı.
 *
 * @param itemKey  ertelenen işin anahtarı (taahhüt/komut başlığı)
 * @param todayDeferCount  bugün bu item için kaçıncı erteleme (0 = ilk)
 *
 * 1. erteleme: "kaçta sorayım?" — kullanıcı saat verir.
 * 2. aynı item: kalıp sorusu ("bu işi 2. kez erteliyorsun, seni durduran ne?").
 * 3.+: aynı gün asla 3. kez dürtme.
 * Günler arası tekrar: mentor_memory occurrences ≥ 2-3 → kalıp adlandır.
 */
export async function decideSnooze(
  itemKey: string,
  todayDeferCount: number,
): Promise<SnoozeDecision> {
  // Günler arası kalıp: deferral belleğini güncelle ve eşik kontrolü yap.
  await recordMemory("deferral", itemKey, { text: itemKey });
  const crossDayOccurrences = await getMemoryOccurrences("deferral", itemKey);
  const shouldNamePattern = crossDayOccurrences >= 3;

  const deferCount = todayDeferCount + 1;

  if (deferCount >= 3) {
    return {
      message:
        "Tamam, bugün bu kadar üstüne gelmeyeceğim. Sistemi bozmadın. Hazır olduğunda sen yaz, ben buradayım.",
      deferCount,
      suppressNextNudge: true,
      shouldNamePattern,
    };
  }

  if (deferCount === 2) {
    const patternLine = shouldNamePattern
      ? "\n\nSon birkaç gündür bu iş hep erteleniyor — belki onu 5 dakikalık tek bir somut adıma indirsek? (örn: sadece dosyayı aç)"
      : "";
    return {
      message: `Bunu bugün 2. kez erteliyoruz. Yargı yok — ama merak ettim: seni durduran ne? İstersen 5 dakikalık mini bir adıma bölelim.${patternLine}`,
      deferCount,
      suppressNextNudge: false,
      shouldNamePattern,
    };
  }

  // 1. erteleme — saat iste.
  return {
    message: "Tamam, sıkıntı yok. Kaçta tekrar sorayım? (örn: 15:00 veya 'akşam')",
    deferCount,
    suppressNextNudge: false,
    shouldNamePattern,
  };
}

// ── Mikro başlangıç ──────────────────────────────────────────────────────────

export function microStartMessage(commitment?: string | null): string {
  const what = commitment && commitment.trim().length > 0 ? `"${commitment}"` : "o işi";
  return `Takıldıysan en küçük adımı atalım: ${what} için sadece dosyayı/uygulamayı aç ve bana "açtım" yaz. Gerisini birlikte hallederiz.`;
}

export function microStartAck(): string {
  return "İşte bu. En zor kısım başlamaktı, onu geçtin. 5 dakika sadece bak — devamı çoğu zaman kendi gelir. 💪";
}

// ── Sabah taahhüt / akşam geri-çağırma metinleri ─────────────────────────────

export function morningCommitmentQuestion(): string {
  return `Günaydın Cem. 🌅\n\nÖnce tek soru: bugünkü enerjin nasıl — düşük / orta / yüksek?\n\nSonra: bugünü "iyi geçti" saymak için kesin yapman gereken <b>tek</b> şey ne? Bir cümleyle yaz.`;
}

export function commitmentTimeQuestion(commitment: string): string {
  return `Tamam: <b>${commitment}</b>. Bunu kaçta yapıyorsun? (örn: 14:00 veya "öğleden sonra") — o saatte hatırlatırım, üstüne gelmem.`;
}

export function commitmentSetConfirmation(commitment: string, doAt: string | null): string {
  const when = doAt ? ` (${doAt})` : "";
  return `Anlaştık. Tek kilit: <b>${commitment}</b>${when}. Gerisi bonus. Akşam sadece bunu soracağım.`;
}

export function eveningRecallQuestion(commitment: string): string {
  return `Akşam yoklaması Cem. Sabah dediğin tek şey: <b>${commitment}</b> — oldu mu?\n\nCevapla: tamam / olmadı`;
}

export async function eveningDoneCelebration(commitment: string): Promise<string> {
  await recordMemory("win", commitment.slice(0, 80), { text: commitment }, 0.15);
  return `Helal olsun. <b>${commitment}</b> tamamsa bugün kazanılmış gündür. Tek söz verdin, tuttun — sistem bu işte. 🎯`;
}

export function eveningMissedCuriousQuestion(): string {
  return "Sorun değil, sistem bozulmadı. Sadece merak ediyorum: önüne ne çıktı? (tek cümle yeter — yarın ona göre ayarlarız)";
}
