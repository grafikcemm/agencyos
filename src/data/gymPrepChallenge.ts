// 30 Günlük Koşu Bandı + Beslenme Kampı (Salon Üyeliği Yolu)
// Bu pencere boyunca antrenman (spor) sistemi kilitlidir; ana sayfada
// antrenman görevi gösterilmez, yerine her güne 40 dk koşu bandı konur.
// 30 günün en az 22'sinde koşu bandı + beslenme başarılı olursa salon üyeliği hak edilir.

import { PROTOCOL_START_DATE } from "./healthProtocol";

export const GYM_PREP_START_DATE = PROTOCOL_START_DATE; // '2026-06-01'
export const GYM_PREP_DURATION_DAYS = 30;
export const GYM_PREP_TARGET_DAYS = 22;
export const GYM_PREP_TREADMILL_MINUTES = 40;

// ISO 'yyyy-MM-dd' tabanlı hesap — getProtocolDay ile aynı mantık (TZ tutarlılığı için).
export function getGymPrepDayFromISO(iso: string): number {
  const start = new Date(GYM_PREP_START_DATE);
  const current = new Date(iso);
  const diff = Math.floor((current.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return diff + 1; // 1 tabanlı; başlangıçtan önce <= 0
}

export function isGymPrepActiveISO(iso: string): boolean {
  const day = getGymPrepDayFromISO(iso);
  return day >= 1 && day <= GYM_PREP_DURATION_DAYS;
}

// Kamptaki belirli bir günün (1 tabanlı) ISO tarihini döndürür.
export function gymPrepDateISO(dayIndex: number): string {
  const start = new Date(GYM_PREP_START_DATE);
  start.setUTCDate(start.getUTCDate() + (dayIndex - 1));
  return start.toISOString().slice(0, 10);
}

// Bir görev şablonunun "antrenman / spor" görevi olup olmadığını belirler.
// Kamp süresince bu görevler ana sayfada gizlenir.
export function isWorkoutTemplate(t: { title?: string | null; system_type?: string | null }): boolean {
  if (t.system_type === "sport") return true;
  const title = (t.title ?? "").toLocaleLowerCase("tr");
  return title.includes("antrenman");
}
