// Source of truth for rhythm scheduling.
// Internal logic (task IDs, Supabase fields, localStorage keys) is untouched.
// This config drives: display titles, optional labels, day visibility helpers.

export type RhythmId = "sport" | "english" | "saz" | "treadmill" | "kelime";

export type DayKey =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

// JS getDay() → DayKey
const JS_TO_DAY: Record<number, DayKey> = {
  0: "sunday",
  1: "monday",
  2: "tuesday",
  3: "wednesday",
  4: "thursday",
  5: "friday",
  6: "saturday",
};

export type RhythmTaskStep = {
  label: string;
  duration?: string;
  required?: boolean;
};

export type RhythmResource = {
  label: string;
  type: "course" | "book" | "app" | "list" | "video" | "other";
};

export type RhythmCompletionRule = {
  label: string;
};

export type WorkoutExercise = {
  name: string;
  sets?: number;
  reps?: string;
  note?: string;
  required?: boolean;
};

export type RhythmVariant = {
  label: string;
  shortLabel?: string;
  duration?: string;
  timeHint?: string;
  optional: boolean;
  intensity?: "mini" | "light" | "main" | "review" | "recovery" | "optional";
  description?: string;
  steps?: RhythmTaskStep[];
  resources?: RhythmResource[];
  completionRules?: RhythmCompletionRule[];
  minimumVersion?: string;
  note?: string;
  // Sport-specific fields
  warmup?: WorkoutExercise[];
  exercises?: WorkoutExercise[];
  cardio?: WorkoutExercise[];
  pool?: string;
  sauna?: string;
  safetyRules?: string[];
};

export const SPORT_GLOBAL_RULES: string[] = [
  "Ağırlıklar RPE 7–8 arası.",
  "Failure yok.",
  "Bel veya bacağa vuran ağrı artarsa hareketi kes.",
  "Koşu yok.",
  "Kardiyo: bisiklet, eliptik veya tempolu yürüyüş.",
  "Program değişmeyecek.",
  "Sadece ağırlık, tekrar veya kardiyo süresi artacak.",
  "Ağrı varsa egoyu bırak, hareketi kes veya hafiflet.",
];

type RhythmConfig = {
  label: string;
  days: readonly DayKey[];
  type?: string;
  timeHint?: string;
  description?: string;
  variants?: Partial<Record<DayKey, RhythmVariant>>;
};

// ── Shared variant bases ───────────────────────────────────────────────────────

const KELIME_VARIANT: RhythmVariant = {
  label: "Günlük İngilizce Kelime",
  duration: "10–15 dk",
  intensity: "mini",
  optional: false,
  description: "8–10 kelime yaz, her kelimeyle 1 cümle kur, dünün kelimelerini hatırla.",
  steps: [
    { label: "Dün çalıştığın kelimeleri hatırlamaya çalış", required: true },
    { label: "8–10 yeni kelime yaz", required: true },
    { label: "Her kelimeyle 1 basit cümle kur", required: true },
    { label: "Zorlandığın kelimeleri işaretle" },
    { label: "Minimum günlerde sadece 5 kelime yap" },
  ],
  resources: [
    { label: "Oxford 3000 kelime listeleri", type: "list" },
    { label: "Fielse Vocabulary Mastery", type: "course" },
    { label: "English for Everyone Vocabulary", type: "book" },
    { label: "Vocabulary in Use", type: "book" },
    { label: "Words A1-A2 B1-B2 C1-C2", type: "book" },
  ],
  completionRules: [
    { label: "8–10 kelime yazıldı" },
    { label: "Her kelimeyle 1 cümle kuruldu" },
    { label: "Dünün kelimeleri tekrar edildi" },
  ],
  minimumVersion: "5 kelime yaz, 5 basit cümle kur.",
};

// Günlük tek İngilizce çapası — İngilizce360 (Gamel Hoca, Udemy) omurga + dış kelime defteri.
// Eski kelime + english ritimleri bu tek günlük ritme birleşti (2026-06-07).
const ENGLISH_DAILY_VARIANT: RhythmVariant = {
  label: "İngilizce — Günlük Ders",
  duration: "15 dk",
  intensity: "main",
  optional: false,
  description:
    "Her gün tek çapa: İngilizce360 kursundan sırayla 1 ders + kelime defterine 3-5 kelime. " +
    "Yorgun/yoğun günde sadece kelime yaz — gün yine tamam, zincir kırılmaz.",
  steps: [
    { label: "İngilizce360'ta sıradaki dersi kaldığın yerden aç", required: true },
    { label: "Dersi izle (uzunsa 2 güne bölebilirsin)", required: true },
    { label: "Derste geçen 3-5 yeni kelimeyi/kalıbı defterine yaz", required: true },
    { label: "İş kelimelerine öncelik ver: brief, deadline, layout, client..." },
    { label: "TABAN (yorgun gün): sadece deftere 5 kelime yaz — gün tamam" },
  ],
  resources: [
    { label: "İngilizce360: A1-C1 İngilizce Kursu (Gamel Hoca, Udemy)", type: "course" },
    { label: "Kelime defteri — dış/fiziksel (kağıt veya Notion)", type: "other" },
    { label: "The Oxford 3000 kelime listesi (yedek havuz)", type: "list" },
    { label: "8000'de en çok kullanılan 1500 kelime (yedek)", type: "book" },
  ],
  completionRules: [
    { label: "1 İngilizce360 dersi izlendi (veya devam edildi)" },
    { label: "Deftere 3-5 kelime yazıldı" },
    { label: "Taban gün: en az 5 kelime yazıldı" },
  ],
  minimumVersion: "Sadece kelime defterine 5 kelime yaz.",
};

// ── Main schedule ──────────────────────────────────────────────────────────────

export const RHYTHM_SCHEDULE = {
  sport: {
    label: "Spor",
    days: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const,
    type: "main",
    timeHint: "Akşam / iş çıkışı",
    description: "İş biter bitmez. Eve gelip oturmadan çık.",
    variants: {
      monday: {
        label: "Upper A",
        shortLabel: "Upper A",
        duration: "75–90 dk",
        timeHint: "Akşam / iş çıkışı",
        intensity: "main",
        optional: false,
        description: "Üst vücut ana gün. Göğüs, sırt, omuz ve kol. Antrenman sonunda eğimli kardiyo + havuz/sauna.",
        warmup: [
          { name: "Bisiklet veya eliptik", reps: "10 dk" },
        ],
        exercises: [
          { name: "Machine Chest Press", sets: 4, reps: "8–12 tekrar" },
          { name: "Chest Supported Row Machine", sets: 4, reps: "8–12 tekrar" },
          { name: "Neutral Grip Lat Pulldown", sets: 3, reps: "10–12 tekrar" },
          { name: "Machine Shoulder Press", sets: 3, reps: "8–10 tekrar" },
          { name: "Cable Lateral Raise", sets: 4, reps: "12–20 tekrar" },
          { name: "Rope Pushdown", sets: 3, reps: "10–15 tekrar" },
          { name: "Hammer Curl", sets: 3, reps: "10–15 tekrar" },
          { name: "Face Pull", sets: 3, reps: "15–20 tekrar", note: "Tükeniş" },
        ],
        cardio: [
          { name: "Eğimli kardiyo", reps: "25 dk" },
        ],
        pool: "15 dk",
        sauna: "15 dk",
        completionRules: [
          { label: "Isınma yapıldı" },
          { label: "Ana hareketler tamamlandı" },
          { label: "Kardiyo (25 dk) tamamlandı" },
          { label: "Havuz + sauna yapıldı" },
          { label: "RPE 7–8 dışına çıkılmadı" },
        ],
        safetyRules: ["Bel ağrısı takip edildi", "Failure yapılmadı"],
      } as RhythmVariant,

      tuesday: {
        label: "Lower A",
        shortLabel: "Lower A",
        duration: "75–90 dk",
        timeHint: "Akşam / iş çıkışı",
        intensity: "main",
        optional: false,
        description: "Alt vücut ana gün. Kontrollü derinlik, bel/bacak ağrısı takibi. Sonunda eğimli kardiyo + havuz/sauna.",
        warmup: [
          { name: "Bisiklet veya eliptik", reps: "10 dk" },
        ],
        exercises: [
          { name: "Seated Leg Curl", sets: 4, reps: "8–12 tekrar" },
          { name: "Leg Press", sets: 4, reps: "8–12 tekrar" },
          { name: "Leg Extension", sets: 3, reps: "10–12 tekrar" },
          { name: "Hip Thrust Machine", sets: 3, reps: "8–10 tekrar" },
          { name: "Seated Calf Raise", sets: 4, reps: "12–20 tekrar" },
          { name: "Pallof Press", sets: 3, reps: "10–15 tekrar" },
          { name: "Side Plank", sets: 3, reps: "10–15 tekrar" },
        ],
        cardio: [
          { name: "Eğimli kardiyo", reps: "25 dk" },
        ],
        pool: "15 dk",
        sauna: "15 dk",
        completionRules: [
          { label: "Isınma yapıldı" },
          { label: "Lower hareketleri tamamlandı" },
          { label: "Kardiyo (25 dk) tamamlandı" },
          { label: "Havuz + sauna yapıldı" },
          { label: "Bel/bacak ağrısı kontrol edildi" },
        ],
        safetyRules: ["Leg Press derinliğine dikkat", "Bel ağrısı takip edildi"],
      } as RhythmVariant,

      wednesday: {
        label: "Kondisyon + Core + Havuz",
        shortLabel: "Kondisyon",
        duration: "60–75 dk",
        timeHint: "Akşam / iş çıkışı",
        intensity: "light",
        optional: false,
        description: "Aktif toparlanma günü. Core stabilizasyonu + uzun havuz. Hafif tempo, ağırlık yarışı yok.",
        warmup: [
          { name: "Bisiklet veya eliptik", reps: "10 dk" },
        ],
        exercises: [
          { name: "Pallof Press", sets: 3, reps: "10–12 tekrar" },
          { name: "Dead Bug", sets: 3, reps: "12–15 tekrar" },
          { name: "Bird Dog", sets: 3, reps: "10–12 tekrar" },
          { name: "Glute Bridge", sets: 3, reps: "8–12 tekrar" },
          { name: "Side Plank", sets: 3, reps: "2–3 set tutma" },
        ],
        cardio: [
          { name: "Eğimli kardiyo", reps: "20 dk" },
        ],
        pool: "25–35 dk",
        sauna: "15 dk",
        completionRules: [
          { label: "Isınma yapıldı" },
          { label: "Core hareketleri tamamlandı" },
          { label: "Kardiyo (20 dk) tamamlandı" },
          { label: "Havuz (25–35 dk) + sauna yapıldı" },
        ],
        safetyRules: ["Aktif toparlanma — zorlanma yok", "Bel ağrısı takip edildi"],
      } as RhythmVariant,

      thursday: {
        label: "Upper B",
        shortLabel: "Upper B",
        duration: "75–90 dk",
        timeHint: "Akşam / iş çıkışı",
        intensity: "main",
        optional: false,
        description: "Üst vücut ikinci gün. Farklı press/row açıları, arka omuz, kol. Sonunda eğimli kardiyo + havuz/sauna.",
        warmup: [
          { name: "Bisiklet veya eliptik", reps: "10 dk" },
        ],
        exercises: [
          { name: "Incline Machine Press", sets: 4, reps: "10–12 tekrar" },
          { name: "Seated Cable Row", sets: 4, reps: "12–15 tekrar" },
          { name: "Lat Pulldown", sets: 3, reps: "10–12 tekrar" },
          { name: "Pec Deck", sets: 3, reps: "8–12 tekrar" },
          { name: "Reverse Pec Deck", sets: 3, reps: "8–12 tekrar" },
          { name: "Cable Curl", sets: 3, reps: "8–12 tekrar" },
          { name: "Rope Pushdown", sets: 3, reps: "8–12 tekrar" },
          { name: "Cable Lateral Raise", sets: 3, reps: "8–12 tekrar" },
          { name: "Side Plank", sets: 3, reps: "2–3 set tutma" },
        ],
        cardio: [
          { name: "Eğimli kardiyo", reps: "20 dk" },
        ],
        pool: "25 dk",
        sauna: "15 dk",
        completionRules: [
          { label: "Isınma yapıldı" },
          { label: "Ana hareketler tamamlandı" },
          { label: "Kardiyo (20 dk) tamamlandı" },
          { label: "Havuz + sauna yapıldı" },
          { label: "RPE 7–8 korundu" },
        ],
        safetyRules: ["Bel ağrısı takip edildi", "Failure yapılmadı"],
      } as RhythmVariant,

      friday: {
        label: "Lower B",
        shortLabel: "Lower B",
        duration: "80–95 dk",
        timeHint: "Akşam / iş çıkışı",
        intensity: "main",
        optional: false,
        description: "Alt vücut ikinci gün. Kontrollü bacak çalışması + uzun kardiyo + havuz/sauna.",
        warmup: [
          { name: "Bisiklet veya eliptik", reps: "10 dk" },
        ],
        exercises: [
          { name: "Lying veya Seated Leg Curl", sets: 4, reps: "8–10 tekrar" },
          { name: "Supported Split Squat", sets: 3, reps: "10–12 tekrar" },
          { name: "Leg Press", sets: 3, reps: "12–15 tekrar" },
          { name: "Leg Extension", sets: 3, reps: "12–15 tekrar" },
          { name: "Cable Hip Abduction", sets: 3, reps: "15–20 tekrar" },
          { name: "Seated Calf Raise", sets: 4, reps: "10–15 tekrar" },
          { name: "Pallof Press", sets: 3, reps: "10–15 tekrar" },
          { name: "Dead Bug", sets: 2, reps: "15–20 tekrar" },
        ],
        cardio: [
          { name: "Eğimli kardiyo", reps: "30 dk" },
        ],
        pool: "15 dk",
        sauna: "15 dk",
        completionRules: [
          { label: "Isınma yapıldı" },
          { label: "Lower hareketleri tamamlandı" },
          { label: "Uzun kardiyo (30 dk) tamamlandı" },
          { label: "Havuz + sauna yapıldı" },
          { label: "Failure yapılmadı" },
        ],
        safetyRules: ["Bel ağrısı takip edildi", "Failure yapılmadı"],
      } as RhythmVariant,

      saturday: {
        label: "Lower B + Metabolik Gün",
        shortLabel: "Metabolik",
        duration: "75–90 dk",
        timeHint: "Akşam / iş çıkışı",
        intensity: "main",
        optional: false,
        description: "Alt vücut metabolik bitiriş günü. Kontrollü bacak çalışması + core. Enerjini dengeli kullan.",
        warmup: [
          { name: "Bisiklet veya eliptik", reps: "10 dk" },
        ],
        exercises: [
          { name: "Leg Press", sets: 4, reps: "12–15 tekrar", note: "Kontrollü derinlik — bel/bacak ağrısı artarsa kes" },
          { name: "Lying veya Seated Leg Curl", sets: 4, reps: "10–12 tekrar" },
          { name: "Leg Extension", sets: 3, reps: "15–20 tekrar" },
          { name: "Supported Split Squat", sets: 3, reps: "8–10 tekrar" },
          { name: "Cable Hip Abduction", sets: 3, reps: "12–15 tekrar" },
          { name: "Seated Calf Raise", sets: 4, reps: "12–20 tekrar" },
          { name: "Bird Dog", sets: 3, reps: "8 tekrar" },
          { name: "Pallof Press", sets: 3, reps: "12 tekrar" },
        ],
        cardio: [
          { name: "Eğimli kardiyo", reps: "20 dk" },
        ],
        completionRules: [
          { label: "Isınma yapıldı" },
          { label: "Lower hareketleri tamamlandı" },
          { label: "Core hareketleri tamamlandı" },
          { label: "Kardiyo (20 dk) tamamlandı" },
          { label: "Ağrı kontrolü yapıldı" },
        ],
        safetyRules: ["Cumartesi yoğun gün — enerjini dengeli kullan", "Bel ağrısı takip edildi"],
      } as RhythmVariant,
    } as Partial<Record<DayKey, RhythmVariant>>,
  },

  // ── ARŞİV (aktif değil) — günlük kelime artık english ritmine birleşti (2026-06-07). Silinmedi, referans için tutuldu.
  kelime: {
    label: "Günlük İngilizce Kelime (arşiv)",
    days: [] as const,
    variants: {
      monday:    KELIME_VARIANT,
      tuesday:   KELIME_VARIANT,
      wednesday: KELIME_VARIANT,
      thursday:  KELIME_VARIANT,
      friday:    KELIME_VARIANT,
      saturday:  KELIME_VARIANT,
      sunday:    KELIME_VARIANT,
    },
  },

  english: {
    label: "İngilizce",
    days: [
      "monday", "tuesday", "wednesday", "thursday",
      "friday", "saturday", "sunday",
    ] as const,
    variants: {
      monday:    ENGLISH_DAILY_VARIANT,
      tuesday:   ENGLISH_DAILY_VARIANT,
      wednesday: ENGLISH_DAILY_VARIANT,
      thursday:  ENGLISH_DAILY_VARIANT,
      friday:    ENGLISH_DAILY_VARIANT,
      saturday:  ENGLISH_DAILY_VARIANT,
      sunday:    ENGLISH_DAILY_VARIANT,
    } as Partial<Record<DayKey, RhythmVariant>>,
  },

  // ── ARŞİV (aktif değil) — kullanıcı sazı şimdilik bıraktı (2026-06-07). Silinmedi, geri açmak için days'i doldur.
  saz: {
    label: "Saz (arşiv)",
    days: [] as const,
    variants: {
      wednesday: {
        label: "Saz Ana Ders 1",
        duration: "35–45 dk",
        intensity: "main",
        optional: false,
        description: "Udemy başlangıç kursundan 1 ders grubu izle. Akort yap, dersi uygula, zorlandığın kısmı 5 tekrar çalış. Amaç yeni konu öğrenmek.",
        steps: [
          { label: "Sazı akort et", required: true },
          { label: "Udemy başlangıç kursundan 1 ders grubu izle", required: true },
          { label: "Dersi uygulamalı çalış", required: true },
          { label: "Zorlandığın kısmı 5 tekrar yap", required: true },
          { label: "Kısa not al: bugün ne öğrendim?" },
        ],
        resources: [
          { label: "Udemy başlangıç saz kursu", type: "course" },
        ],
        completionRules: [
          { label: "Akort yapıldı" },
          { label: "1 ders grubu izlendi" },
          { label: "Uygulama yapıldı" },
          { label: "Zorlanılan kısım 5 tekrar edildi" },
        ],
      } as RhythmVariant,

      saturday: {
        label: "Saz Ana Ders 2",
        duration: "35–45 dk",
        intensity: "main",
        optional: false,
        description: "Udemy dersine devam et. Önceki konuyu 5 dk tekrar et, yeni dersi izle, uygulama yap. Amaç haftanın ana ilerlemesini almak.",
        steps: [
          { label: "Önceki konuyu 5 dk tekrar et", duration: "5 dk", required: true },
          { label: "Udemy dersine devam et", required: true },
          { label: "Yeni konuyu uygula", required: true },
          { label: "Zorlandığın yeri işaretle", required: true },
          { label: "Haftanın ana ilerlemesini not al" },
        ],
        resources: [
          { label: "Udemy başlangıç saz kursu", type: "course" },
        ],
        completionRules: [
          { label: "5 dk tekrar yapıldı" },
          { label: "Yeni ders izlendi" },
          { label: "Uygulama yapıldı" },
          { label: "Zorlanılan yer not edildi" },
        ],
      } as RhythmVariant,

      sunday: {
        label: "Saz Tekrar + Ders",
        duration: "35–45 dk",
        intensity: "review",
        optional: false,
        description: "Önceki iki saz gününü tekrar et. Kısa kayıt al. Hatalı kısmı çalış. Enerjin varsa Udemy'den kısa bir sonraki derse geç.",
        steps: [
          { label: "Çarşamba ve Cumartesi konularını tekrar et", required: true },
          { label: "Kısa kayıt al", required: true },
          { label: "Kaydı dinle", required: true },
          { label: "Hatalı kısmı çalış", required: true },
          { label: "Enerji varsa kısa bir sonraki Udemy dersine geç" },
        ],
        resources: [
          { label: "Udemy başlangıç saz kursu", type: "course" },
          { label: "Telefon ses kaydı", type: "app" },
        ],
        completionRules: [
          { label: "Önceki iki konu tekrar edildi" },
          { label: "Kısa kayıt alındı" },
          { label: "Hatalı kısım çalışıldı" },
        ],
        note: "Pazar günü saz ritmi tekrar odaklıdır. Yeni ders zorunlu değildir.",
      } as RhythmVariant,
    } as Partial<Record<DayKey, RhythmVariant>>,
  },

  treadmill: {
    label: "Koşu Bandı",
    days: ["tuesday", "thursday", "sunday"] as const,
    type: "recovery",
    description: "Spor değil, aktif toparlanma.",
    variants: {
      tuesday: {
        label: "Koşu Bandı",
        duration: "20 dk",
        timeHint: "Sabah",
        optional: false,
        intensity: "recovery",
      },
      thursday: {
        label: "Koşu Bandı",
        duration: "20 dk",
        timeHint: "Sabah",
        optional: false,
        intensity: "recovery",
      },
      sunday: {
        label: "Hafif Yürüyüş",
        duration: "Opsiyonel",
        timeHint: "Hafif tempo",
        optional: true,
        intensity: "light",
      },
    } as Partial<Record<DayKey, RhythmVariant>>,
  },
} satisfies Record<RhythmId, RhythmConfig>;

// ── Helpers ──────────────────────────────────────────────────────────────────

function toDayKey(date: Date): DayKey {
  return JS_TO_DAY[date.getDay()];
}

export function isRhythmActiveToday(rhythmId: RhythmId, date: Date = new Date()): boolean {
  const dayKey = toDayKey(date);
  return (RHYTHM_SCHEDULE[rhythmId].days as readonly string[]).includes(dayKey);
}

export function getRhythmVariantForDay(
  rhythmId: RhythmId,
  date: Date = new Date()
): RhythmVariant | null {
  const dayKey = toDayKey(date);
  const config = RHYTHM_SCHEDULE[rhythmId];
  if (!isRhythmActiveToday(rhythmId, date)) return null;
  const variants = "variants" in config ? config.variants : undefined;
  return variants?.[dayKey] ?? null;
}

export function getTodayRhythms(date: Date = new Date()): RhythmId[] {
  return (Object.keys(RHYTHM_SCHEDULE) as RhythmId[]).filter(id =>
    isRhythmActiveToday(id, date)
  );
}

export function isRhythmOptionalToday(rhythmId: RhythmId, date: Date = new Date()): boolean {
  const variant = getRhythmVariantForDay(rhythmId, date);
  return variant?.optional ?? false;
}

export function mapTurkishDayToDayKey(day: string): DayKey | null {
  const map: Record<string, DayKey> = {
    Pazartesi: "monday",  Pzt: "monday",
    Salı:      "tuesday", Sal: "tuesday",
    Çarşamba:  "wednesday", Çrş: "wednesday", CRS: "wednesday",
    Perşembe:  "thursday", Prş: "thursday",
    Cuma:      "friday",  Cum: "friday",
    Cumartesi: "saturday", Cts: "saturday", CMT: "saturday",
    Pazar:     "sunday",  Paz: "sunday",
  };
  return map[day] ?? null;
}
