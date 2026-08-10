// ─────────────────────────────────────────────────────────────────────────────
// LIFE UI SAHIPLIGI — kesin karar.
//
// Kisisel gorev/aliskanlik yonetimi GrafikcemOS Hayat Merkezi'ne tasiniyor.
// VERI TASINMIYOR: LIFE Supabase projesi tek dogruluk kaynagi olarak kaliyor ve
// Telegram/orchestrator o tablolari dogrudan okumaya devam ediyor. Tasinan sey
// PANEL sahipligi.
//
// 2026-08-10 kullanıcı kararıyla panel sahipliği GrafikcemOS'a kesin devredildi.
// Eski env anahtarı yalnız tanılama/geriye dönük yapılandırma uyumu için okunur;
// AgencyOS yüzeylerini yeniden açamaz. Veri ve ajan yazma yolları korunur.
// ─────────────────────────────────────────────────────────────────────────────

export type LifeUiOwner = 'agencyos' | 'cemos'
export type LifeFlagEnv = Readonly<Record<string, string | undefined> & { LIFE_UI_OWNER?: string }>

/**
 * Eski imzayı korur; panel sahipliği her ortamda kesin olarak GrafikcemOS'tadır.
 */
export function lifeUiOwner(env: LifeFlagEnv = process.env): LifeUiOwner {
  void env
  return 'cemos'
}

/** AgencyOS kisisel LIFE yuzeylerini gosteriyor mu. */
export const showsLifeUi = (env: LifeFlagEnv = process.env) => {
  void env
  return false
}

/** Panelde gosterilecek durum ozeti — deger degil, DURUM. */
export function describeLifeFlag(env: LifeFlagEnv = process.env) {
  const owner = lifeUiOwner(env)
  return {
    key: 'LIFE_UI_OWNER',
    value: owner,
    description: 'Kisisel gorev/aliskanlik paneli GrafikcemOS Hayat Merkezi\'nde. Veri yine LIFE DB\'de.',
  }
}
