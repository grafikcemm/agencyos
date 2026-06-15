export interface DayConfig {
  gun: string;
  odakTema: string;
  renk: string;
  antrenmanVar: boolean;
  antrenmanAdi: string;
}

// key = JS getDay() index: 0=Pazar, 1=Pazartesi, ..., 6=Cumartesi
// Spor günleri: Pazartesi(1), Çarşamba(3), Cuma(5), Cumartesi(6)
export const weeklyFocusConfig: Record<number, DayConfig> = {
  1: {
    gun: "Pazartesi",
    odakTema: "Ajans + Kariyer",
    renk: "#6B8EBF",
    antrenmanVar: true,
    antrenmanAdi: "Spor (Akşam)",
  },
  2: {
    gun: "Salı",
    odakTema: "Üniversite + Ajans",
    renk: "#8B7AC4",
    antrenmanVar: false,
    antrenmanAdi: "Aktif Toparlanma",
  },
  3: {
    gun: "Çarşamba",
    odakTema: "Üniversite + Deep Work",
    renk: "#5B9E9E",
    antrenmanVar: true,
    antrenmanAdi: "Spor (Akşam)",
  },
  4: {
    gun: "Perşembe",
    odakTema: "Ajans + Kariyer",
    renk: "#6B8EBF",
    antrenmanVar: false,
    antrenmanAdi: "Aktif Toparlanma",
  },
  5: {
    gun: "Cuma",
    odakTema: "Üniversite + İçerik",
    renk: "#7C9A72",
    antrenmanVar: true,
    antrenmanAdi: "Spor (Akşam)",
  },
  6: {
    gun: "Cumartesi",
    odakTema: "Serbest Üretim",
    renk: "#D4A574",
    antrenmanVar: true,
    antrenmanAdi: "Spor (Akşam)",
  },
  0: {
    gun: "Pazar",
    odakTema: "Şarj Günü",
    renk: "#606060",
    antrenmanVar: false,
    antrenmanAdi: "Dinlenme",
  },
};

export function getTodayConfig(): DayConfig {
  return weeklyFocusConfig[new Date().getDay()];
}
