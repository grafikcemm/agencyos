export interface ScoringResult {
  potential_score: number;
  sector_score: number;
  firm_score: number;
  wave: number;
  priority: 'low' | 'normal' | 'high';
  score_reasons: { reason: string; points: number }[];
  vertical_id: string;
}

const FIRST_WAVE_SECTORS = [
  'diş hekimi', 'diş kliniği', 'dentist', 'estetik merkezi', 'estetik',
  'spor salonu', 'fitness', 'diyetisyen', 'beslenme danışmanı',
  'klinik', 'özel klinik', 'özel hastane', 'saç ekim'
];

const SECOND_WAVE_SECTORS = [
  'muhasebe', 'mali müşavir', 'hukuk', 'avukat', 'lojistik', 'nakliye',
  'e-ticaret', 'güzellik salonu', 'kuaför', 'nail art'
];

export function calculateNicheScore(
  sector: string,
  city: string,
  hasWebsite: boolean,
  phone: string | null,
  rating: number | null,
  reviewCount: number
): ScoringResult {
  let sector_score = 10;
  let wave = 3;
  let vertical_id = 'other';
  const score_reasons: { reason: string; points: number }[] = [];

  const sectorLower = (sector || '').toLowerCase().trim();
  const cityLower = (city || '').toLowerCase().trim();

  // 1. Sector Wave & Base Score Calculation
  const isFirstWave = FIRST_WAVE_SECTORS.some(s => sectorLower.includes(s));
  const isSecondWave = SECOND_WAVE_SECTORS.some(s => sectorLower.includes(s));

  if (isFirstWave) {
    sector_score = 50;
    wave = 1;
    vertical_id = 'first_wave_local';
    score_reasons.push({ reason: `1. Dalga Sektör: ${sector} (Yüksek ciro potansiyeli & hızlı dönüş ihtiyacı)`, points: 50 });
  } else if (isSecondWave) {
    sector_score = 30;
    wave = 2;
    vertical_id = 'second_wave_ops';
    score_reasons.push({ reason: `2. Dalga Sektör: ${sector} (Operasyonel & belge yükü yüksek)`, points: 30 });
  } else {
    score_reasons.push({ reason: `3. Dalga / Diğer Sektör: ${sector}`, points: 10 });
  }

  // 2. City Multipliers (Bonuses)
  let city_bonus = 0;
  if (cityLower.includes('istanbul') || cityLower.includes('İstanbul')) {
    city_bonus = 15;
    score_reasons.push({ reason: 'Büyükşehir Bonusu: İstanbul (+15)', points: 15 });
  } else if (cityLower.includes('ankara') || cityLower.includes('izmir') || cityLower.includes('izmir')) {
    city_bonus = 10;
    score_reasons.push({ reason: `Büyükşehir Bonusu: ${city} (+10)`, points: 10 });
  } else if (cityLower.includes('bursa') || cityLower.includes('antalya')) {
    city_bonus = 5;
    score_reasons.push({ reason: `Metropol Bonusu: ${city} (+5)`, points: 5 });
  }

  // 3. Firm Specific Scores & Penalties
  let firm_score = 0;

  // Web sitesi yoksa bu bizim için devasa bir fırsat (kendi landing page / reklam hunisi satabiliriz)
  if (!hasWebsite) {
    firm_score += 25;
    score_reasons.push({ reason: 'Web Sitesi Yok (Hazır Ajanlı Huni Teklifi Fırsatı) (+25)', points: 25 });
  } else {
    firm_score -= 10;
    score_reasons.push({ reason: 'Web Sitesi Var (-10)', points: -10 });
  }

  // Telefon bulunmuyorsa outbound iletişimi zordur
  if (!phone) {
    firm_score -= 40;
    score_reasons.push({ reason: 'Telefon Numarası Eksik (Outbound engeli) (-40)', points: -40 });
  } else {
    firm_score += 10;
    score_reasons.push({ reason: 'Telefon Numarası Mevcut (+10)', points: 10 });
  }

  // Google Harita Puanı Değerlendirmesi
  if (rating !== null) {
    if (rating < 4.0) {
      firm_score += 15;
      score_reasons.push({ reason: `Google Puanı Düşük (${rating}) (İtibar yönetimi & canlandırma fırsatı) (+15)`, points: 15 });
    } else if (rating > 4.7 && reviewCount > 150) {
      firm_score -= 15;
      score_reasons.push({ reason: `Oturmuş İşletme Puanı (${rating}, ${reviewCount} yorum) (Düşük dönüş ihtiyacı) (-15)`, points: -15 });
    }
  }

  // Yorum Sayısı Değerlendirmesi
  if (reviewCount < 10) {
    firm_score += 15;
    score_reasons.push({ reason: 'Yorum Sayısı Çok Az (<10) (Sosyal kanıt & otorite kurulum paketi ihtiyacı) (+15)', points: 15 });
  } else if (reviewCount < 40) {
    firm_score += 5;
    score_reasons.push({ reason: 'Yorum Sayısı Kısıtlı (<40) (+5)', points: 5 });
  }

  // Toplam skor hesabı
  let potential_score = sector_score + city_bonus + firm_score;
  potential_score = Math.max(0, Math.min(100, potential_score));

  // Öncelik Sınıflandırması
  let priority: 'low' | 'normal' | 'high' = 'normal';
  if (potential_score >= 70) {
    priority = 'high';
  } else if (potential_score < 45) {
    priority = 'low';
  }

  return {
    potential_score,
    sector_score,
    firm_score: city_bonus + firm_score,
    wave,
    priority,
    score_reasons,
    vertical_id
  };
}
