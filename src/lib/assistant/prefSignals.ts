export interface PrefSignals {
  food_likes?: string[];
  food_dislikes?: string[];
  notes?: Record<string, string>;
}

const NEGATIVE_SENTIMENT = /\s*(?:sevmiyorum|istemiyorum|yemiyorum|yemem|tüketmiyorum|tüketmem|dokunuyor|tetikliyor|olmaz|hayır|sevemedim|kullanmıyorum)/i;

const DISLIKE_PATTERNS: Array<[RegExp, string]> = [
  [new RegExp(`sebze${NEGATIVE_SENTIMENT.source}`, 'i'), 'sebze'],
  [new RegExp(`(?:süt\\s*ürünleri|süt)${NEGATIVE_SENTIMENT.source}`, 'i'), 'süt ürünleri'],
  [new RegExp(`(?:yogurt|yoğurt)${NEGATIVE_SENTIMENT.source}`, 'i'), 'süt ürünleri'],
  [new RegExp(`peynir${NEGATIVE_SENTIMENT.source}`, 'i'), 'süt ürünleri'],
  [new RegExp(`gluten${NEGATIVE_SENTIMENT.source}`, 'i'), 'gluten'],
  [new RegExp(`(?:şeker|seker)${NEGATIVE_SENTIMENT.source}`, 'i'), 'şeker'],
  [new RegExp(`ekmek${NEGATIVE_SENTIMENT.source}`, 'i'), 'ekmek'],
];

const LIKE_PATTERNS: Array<[RegExp, string]> = [
  [/(tavuk|chicken)\s*(iyi|güzel|olur|tamam|sever|severim)/i, 'tavuk'],
  [/(yumurta)\s*(iyi|güzel|olur|tamam|sever|severim)/i, 'yumurta'],
  [/(ton balığı|tuna)\s*(iyi|güzel|olur|tamam)/i, 'ton balığı'],
  [/(pratik|hızlı|kolay)\s*(yemek|öğün)/i, 'pratik öğün'],
];

const INTENSITY_PATTERN = /ajans\s*(yoğun|yogun|dağılmış|dagilmis|normal|sakin|rahat)/i;

export function extractPrefSignals(text: string): PrefSignals {
  const signals: PrefSignals = {};

  for (const [pattern, label] of DISLIKE_PATTERNS) {
    if (pattern.test(text)) {
      signals.food_dislikes = [...(signals.food_dislikes ?? []), label];
    }
  }

  for (const [pattern, label] of LIKE_PATTERNS) {
    if (pattern.test(text)) {
      signals.food_likes = [...(signals.food_likes ?? []), label];
    }
  }

  const intensityMatch = INTENSITY_PATTERN.exec(text);
  if (intensityMatch) {
    signals.notes = { intensity: intensityMatch[1].toLowerCase() };
  }

  return signals;
}
