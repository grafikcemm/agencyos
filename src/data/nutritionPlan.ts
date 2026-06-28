// Beslenme programı — tek doğruluk kaynağı.
// Alışkanlık detay panelinde ("Sağlıklı Beslenme ve Günün Antrenmanı") ve
// asistan öğün önerilerinde referans alınır. Değerler kullanıcının verdiği plandan.

export type MealItem = {
  name: string;
  amount?: string;
  note?: string;
};

export type MealBlock = {
  key: string;
  label: string;
  items: MealItem[];
  /** "ya biri ya öteki" karbonhidrat seçenekleri (varsa). */
  carbOptions?: MealItem[];
  note?: string;
};

export const NUTRITION_PLAN: MealBlock[] = [
  {
    key: "sabah",
    label: "Sabah",
    items: [
      { name: "Tam yumurta", amount: "3 adet" },
      { name: "Yumurta beyazı", amount: "150–200 g" },
      { name: "Zeytinyağı", amount: "5 g" },
      { name: "Az yağlı / proteinli yoğurt", amount: "200 g" },
      { name: "Küçük elma veya portakal", amount: "1 adet" },
    ],
  },
  {
    key: "oglen",
    label: "Öğlen",
    items: [
      { name: "Tavuk veya hindi göğsü", amount: "200 g" },
      { name: "Yoğurt", amount: "250 g" },
      { name: "Zeytinyağı", amount: "10 g" },
    ],
  },
  {
    key: "antrenman_sonrasi",
    label: "Antrenman Sonrası",
    items: [
      { name: "Yağsız et / tavuk / hindi / balık", amount: "200 g" },
    ],
    carbOptions: [
      { name: "Haşlanmış veya fırın patates", amount: "200–250 g" },
      { name: "Pişmiş pirinç veya bulgur", amount: "100–130 g" },
    ],
    note: "Karbonhidrat seçeneklerinden biri + protein tozu + supplementler.",
  },
];

/** Kısa metin özeti (asistan / fallback için). */
export function nutritionSummary(): string {
  return NUTRITION_PLAN.map((b) => {
    const items = b.items.map((i) => `${i.name}${i.amount ? ` ${i.amount}` : ""}`).join(", ");
    return `${b.label}: ${items}`;
  }).join(" · ");
}
