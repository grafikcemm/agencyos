import type { AgencyLoad, EnergyLevel } from './dailyOrchestrator';

export type DayModeV2 = 'normal' | 'yogun' | 'dagilmis';

export type ParsedIntent =
  | { type: 'set_agency'; agencyLoad: AgencyLoad }
  | { type: 'set_energy'; energy: EnergyLevel }
  | { type: 'set_state'; agencyLoad: AgencyLoad; energy: EnergyLevel }
  | { type: 'simplify' }
  | { type: 'send_plan' }
  | { type: 'send_status' }
  | { type: 'send_rhythms' }
  | { type: 'send_health' }
  | { type: 'send_finance' }
  | { type: 'send_book' }
  | { type: 'send_shutdown' }
  | { type: 'add_task_draft'; title: string }
  // v2 intents
  | { type: 'set_day_mode'; mode: DayModeV2 }
  | { type: 'complete_last_reminder' }
  | { type: 'skip_last_reminder' }
  | { type: 'snooze_last_reminder' }
  | { type: 'meal_question' }
  | { type: 'learn_preferences'; raw: string }
  // mentor action-loop intents
  | { type: 'snooze_with_time'; time: string }   // "saat 15te sor", "15:00"
  | { type: 'micro_start_done' }                  // "açtım", "başladım"
  | { type: 'unknown'; raw: string };

/** "15:00", "15.30", "saat 3", "akşam 8", "öğleden sonra" → normalize edilmiş HH:MM veya serbest metin. */
export function parseTimeHint(text: string): string | null {
  const t = normaliseText(text.trim());
  // HH:MM veya HH.MM
  const hhmm = t.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
  if (hhmm) {
    const h = hhmm[1].padStart(2, '0');
    return `${h}:${hhmm[2]}`;
  }
  // "saat 15", "15te", "15 te", "15'te"
  const hourOnly = t.match(/\b(?:saat\s*)?([01]?\d|2[0-3])\s*(?:te|de|'te|'de|da|ta)?\b/);
  if (hourOnly && /(saat|te|de|da|ta|sonra|aksam|ogle|sabah)/.test(t)) {
    return `${hourOnly[1].padStart(2, '0')}:00`;
  }
  // serbest zaman ifadeleri
  if (/(aksamustu|aksam)/.test(t)) return 'akşam';
  if (/(ogleden sonra|ogle)/.test(t)) return 'öğleden sonra';
  if (/(sabah)/.test(t)) return 'sabah';
  if (/(birazdan|biraz sonra|az sonra)/.test(t)) return 'birazdan';
  return null;
}

const AGENCY_MAP: Record<string, AgencyLoad> = {
  yoğun: 'high', yogun: 'high', high: 'high',
  normal: 'normal', orta: 'normal',
  rahat: 'low', low: 'low',
};

const ENERGY_MAP: Record<string, EnergyLevel> = {
  düşük: 'low', dusuk: 'low', low: 'low',
  orta: 'medium', medium: 'medium',
  yüksek: 'high', yuksek: 'high', high: 'high',
};

// v2 helpers — normalise Turkish ASCII variants for pattern matching
function normaliseText(s: string): string {
  return s
    .toLowerCase()
    .replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ş/g, 's')
    .replace(/ç/g, 'c').replace(/ö/g, 'o').replace(/ü/g, 'u');
}

const DAY_MODE_PATTERNS: [RegExp, DayModeV2][] = [
  [/^(normal|normalim|normal mod)$/, 'normal'],
  [/^(yo[gğ]un|yo[gğ]unum|yo[gğ]un mod|su an islerim yogun|su an islerim yo[gğ]un|ajans yo[gğ]un|ajans yogun|bugun ajans yo[gğ]un|bugun ajans yogun)$/, 'yogun'],
  [/^(da[gğ][iı]lm[iı][sş]|dagilmis|da[gğ][iı]ld[iı]m|da[gğ][iı]t[iı]k)$/, 'dagilmis'],
];

const MEAL_PATTERN = /(ne yiyecegim|ne yesem|\bogun|yemek oner|bugun ne ye)/i;
const MICRO_START_PATTERN = /^(actim|acdim|basladim|basladik|girdim|baktim|oturdum|baslioyrum|basliyorum)$/i;
const COMPLETE_PATTERN = /^(tamam|tamamd[iı]|ok|bitti|done)$/i;
const SKIP_PATTERN = /^(pas|ge[cç]|yapamad[iı]m|olmad[iı]|skip)$/i;
const SNOOZE_PATTERN = /(ertele|sonra hat[iı]rlat|[sş]imdi yapam[iı]yorum|biraz sonra)/i;
// 'tamam' kaldırıldı: COMPLETE_PATTERN'a aitti, "tamam ben hallederim" gibi mesajları
// yanlışlıkla learn_preferences'a yönlendiriyordu (taahhüt cevabını yutuyordu).
const PREF_PATTERN = /(sevmiyorum|istemiyorum|olmaz|hayır|harir|tercih|sever|tetikliyor)/i;

export function parseTelegramMessage(text: string): ParsedIntent {
  const raw = text.trim();
  const lower = raw.toLowerCase();
  const norm = normaliseText(raw.trim());

  // v2: day mode
  for (const [pattern, mode] of DAY_MODE_PATTERNS) {
    if (pattern.test(norm)) return { type: 'set_day_mode', mode };
  }

  // mentor action-loop: micro-start acknowledgement ("açtım", "başladım")
  if (MICRO_START_PATTERN.test(norm)) return { type: 'micro_start_done' };

  // mentor action-loop: snooze WITH explicit time ("15:00 sor", "saat 3 te hatırlat")
  if (SNOOZE_PATTERN.test(lower)) {
    const t = parseTimeHint(raw);
    if (t) return { type: 'snooze_with_time', time: t };
    return { type: 'snooze_last_reminder' };
  }

  // v2: reminder response
  if (COMPLETE_PATTERN.test(raw.trim())) return { type: 'complete_last_reminder' };
  if (SKIP_PATTERN.test(raw.trim())) return { type: 'skip_last_reminder' };

  // v2: meal question
  if (MEAL_PATTERN.test(norm)) return { type: 'meal_question' };

  // v2: preference learning signal — yalnızca SAF tercih cümlesi (soru içermeyen).
  // "süt sevmiyorum ama ne yiyeyim?" gibi mesajlar burada yutulmasın; '?' varsa
  // aşağıdaki intent/LLM akışına düşer (tercih sinyali yine pasif olarak öğrenilir).
  if (PREF_PATTERN.test(lower) && raw.length < 120 && !raw.includes('?')) {
    return { type: 'learn_preferences', raw };
  }

  // Slash commands
  if (lower === '/plan') return { type: 'send_plan' };
  if (lower === '/durum') return { type: 'send_status' };
  if (lower === '/yogun' || lower === '/yoğun') return { type: 'set_agency', agencyLoad: 'high' };
  if (lower === '/normal') return { type: 'set_agency', agencyLoad: 'normal' };
  if (lower === '/rahat') return { type: 'set_agency', agencyLoad: 'low' };
  if (lower === '/sadelestir') return { type: 'simplify' };
  if (lower === '/ritimler' || lower === '/bonuslar') return { type: 'send_rhythms' };
  if (lower === '/saglik' || lower === '/sağlık') return { type: 'send_health' };
  if (lower === '/finans') return { type: 'send_finance' };
  if (lower === '/kitap') return { type: 'send_book' };
  if (lower === '/shutdown') return { type: 'send_shutdown' };

  if (lower.startsWith('/enerji ')) {
    const part = lower.replace('/enerji ', '').trim();
    const energy = ENERGY_MAP[part];
    if (energy) return { type: 'set_energy', energy };
  }

  // Free-text: "görev ekle: ..."
  if (lower.startsWith('görev ekle:') || lower.startsWith('gorev ekle:')) {
    const title = raw.split(':').slice(1).join(':').trim();
    if (title) return { type: 'add_task_draft', title };
  }

  // "yoğun düşük" / "normal orta" etc.
  const parts = lower.split(/\s+/);
  if (parts.length === 2) {
    const agency = AGENCY_MAP[parts[0]];
    const energy = ENERGY_MAP[parts[1]];
    if (agency && energy) return { type: 'set_state', agencyLoad: agency, energy };
  }

  // Single agency or energy word
  if (parts.length === 1) {
    const agency = AGENCY_MAP[parts[0]];
    if (agency) return { type: 'set_agency', agencyLoad: agency };
    const energy = ENERGY_MAP[parts[0]];
    if (energy) return { type: 'set_energy', energy };
  }

  // Keyword matching
  if (lower.includes('sadeleştir') || lower.includes('sadele') || lower.includes('minimum')) {
    return { type: 'simplify' };
  }
  if (lower.includes('ritim')) return { type: 'send_rhythms' };
  if (lower.includes('sağlık') || lower.includes('saglik') || lower.includes('sağlık')) {
    return { type: 'send_health' };
  }
  if (lower.includes('finans') || lower.includes('para')) return { type: 'send_finance' };
  if (lower.includes('kitap') || lower.includes('okuma')) return { type: 'send_book' };
  if (lower.includes('shutdown') || lower.includes('gün bitti') || lower.includes('gun bitti')) {
    return { type: 'send_shutdown' };
  }
  if (lower.includes('plan') || lower.includes('bugün ne yapayım') || lower.includes('ne yapayim')) {
    return { type: 'send_plan' };
  }

  // Contextual energy/agency keywords
  if (lower.includes('çok yoğun') || lower.includes('cok yogun') || lower.includes('ajans yoğun')) {
    return { type: 'set_agency', agencyLoad: 'high' };
  }
  if (lower.includes('enerjim düşük') || lower.includes('enerji dusuk')) {
    return { type: 'set_energy', energy: 'low' };
  }
  if (lower.includes('dışarıdayım') || lower.includes('disaridayim')) {
    return { type: 'simplify' };
  }

  return { type: 'unknown', raw };
}
