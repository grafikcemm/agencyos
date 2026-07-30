// ─────────────────────────────────────────────────────────────────────────────
// LIFE UI SAHIPLIGI — geri alinabilir tek anahtar.
//
// Kisisel gorev/aliskanlik yonetimi GrafikcemOS Hayat Merkezi'ne tasiniyor.
// VERI TASINMIYOR: LIFE Supabase projesi tek dogruluk kaynagi olarak kaliyor ve
// Telegram/orchestrator o tablolari dogrudan okumaya devam ediyor. Tasinan sey
// PANEL sahipligi.
//
// Bu yuzden kesme noktasi bir kod silme degil, bir bayrak: `cemos` modunda
// AgencyOS yuzeyleri gizlenir, ama write action kodu YERINDE kalir. Sorun
// cikarsa donus tek env degisikligidir; kod geri alinmasi gerekmez.
//
// `flags.ts` idiomu: env string'i, varsayilan KAPALI (burada `agencyos`).
// ─────────────────────────────────────────────────────────────────────────────

export type LifeUiOwner = 'agencyos' | 'cemos'

/**
 * Varsayilan `agencyos`. YALNIZ tam olarak `cemos` yazilmasi sahipligi devreder;
 * yazim hatasi ya da bos deger sessizce tasima YAPMAZ — kullanicinin gunluk
 * yuzeyinin bir yazim hatasiyla kaybolmasi kabul edilemez.
 */
export function lifeUiOwner(env: NodeJS.ProcessEnv = process.env): LifeUiOwner {
  return env.LIFE_UI_OWNER === 'cemos' ? 'cemos' : 'agencyos'
}

/** AgencyOS kisisel LIFE yuzeylerini gosteriyor mu. */
export const showsLifeUi = (env: NodeJS.ProcessEnv = process.env) => lifeUiOwner(env) === 'agencyos'

/** Panelde gosterilecek durum ozeti — deger degil, DURUM. */
export function describeLifeFlag(env: NodeJS.ProcessEnv = process.env) {
  const owner = lifeUiOwner(env)
  return {
    key: 'LIFE_UI_OWNER',
    value: owner,
    description: owner === 'cemos'
      ? 'Kisisel gorev/aliskanlik paneli GrafikcemOS Hayat Merkezi\'nde. Veri yine LIFE DB\'de.'
      : 'Kisisel gorev/aliskanlik paneli AgencyOS\'ta (varsayilan).',
  }
}
