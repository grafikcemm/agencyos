// Alışkanlık detay metinleri — kart tıklanınca açılan panelde gösterilir.
// `habits` tablosunda description kolonu yok; bu yazılı içerik kodda tutulur.
// beslenme & ingilizce ayrıca dinamik içerik alır (program/antrenman), bkz. HabitDetailSheet.

export interface HabitDetail {
  summary: string;
  why: string;
  steps?: string[];
  tips?: string[];
}

export const HABIT_DETAILS: Record<string, HabitDetail> = {
  musteri: {
    summary: "Her gün en az 2 müşteri/lead ile gerçek temas: yaz, mail at veya ara.",
    why: "Pipeline ısınmadan kapanış olmaz. Günde 2 temas = ayda ~40 dokunuş, retainer'a giden yol bu.",
    steps: [
      "Lead Radar / Pipeline'dan bugünkü 2 hedefi seç",
      "Birine yaz veya ara, birine mini değer (audit/fikir) gönder",
      "Sonucu pipeline'da işaretle (cevap bekleniyor / toplantı / pas)",
    ],
    tips: ["Mükemmel mesaj arama — kısa ve net yeterli.", "Reddedilme = veri, kişisel değil."],
  },
  x_post: {
    summary: "X (Twitter) paylaşımlarını yap ve hesaplarını gözden geçir.",
    why: "Tutarlı içerik = bilinirlik + gelen lead. Carousel/reels düzenini X'e taşımak görünürlüğü çoğaltır.",
    steps: [
      "Bugünkü tek paylaşımı at (thread, tek tweet veya görsel)",
      "@grafikcem + diğer hesapları kısa gözden geçir (DM, mention)",
      "Bir fikri sonraki içerik için kaydet",
    ],
    tips: ["Format zaten elinde — Instagram içeriğini yeniden paketле.", "Günde 1 net paylaşım > haftada 7 dağınık."],
  },
  beslenme: {
    summary: "Günün beslenme planına sadık kal ve günün antrenmanını yap.",
    why: "Form + enerji + odak hepsi burada başlar. Protein hedefi tutmazsa antrenman boşa gider.",
    steps: [
      "Sabah, öğlen ve antrenman sonrası öğünlerini plana göre tut",
      "Günün antrenmanını yap (aşağıdaki programa bak)",
      "Su ve supplementleri ihmal etme",
    ],
    tips: ["Hazırlıklı ol — öğünü önceden ayarla, açken karar verme.", "Antrenman = ego değil, kontrollü ilerleme (RPE 7-8)."],
  },
  su: {
    summary: "Gün içinde 3 termos su bitir.",
    why: "Hafif dehidrasyon bile enerji, odak ve antrenman performansını düşürür.",
    steps: ["Sabah ilk termosu doldur", "Öğlene kadar 1, akşama kadar 2'yi bitir", "Antrenmanda 3.'yü tamamla"],
    tips: ["Termosu göz önünde tut — görünmeyen su içilmez."],
  },
  vitamin: {
    summary: "Günlük vitamin/supplement paketini al — gün içi + antrenman sonrası.",
    why: "Küçük ama bileşik etki: bağışıklık, enerji, odak ve toparlanma için temel.",
    tips: [
      "Gün içi paketini sabaha bağla (kahve yanı) — unutma şansı kalmasın.",
      "Antrenman sonrası paketi shake ile birlikte al.",
    ],
  },
  dis: {
    summary: "Dişlerini fırçala — sabah ve akşam.",
    why: "Küçük disiplin, büyük tutarlılığın çapası. Her gün iki kez = bozulmayan bir zincir.",
    steps: ["Sabah fırçala", "Akşam yatmadan fırçala"],
    tips: ["Diğer rutinlere zincirle (yüz bakımı sonrası)."],
  },
  buz: {
    summary: "Sabah yüze buz uygula + temizleme jeli ile yıka.",
    why: "Ödemi indirir, cildi uyandırır, güne keskin bir başlangıç verir.",
    steps: ["Yüze 1-2 dk buz uygula", "Temizleme jeli ile yıka", "Kurula"],
    tips: ["Uyandıktan hemen sonra yap — uykuyu da dağıtır."],
  },
  nemlendirici: {
    summary: "Her gün yüze nemlendirici krem sür.",
    why: "Cilt bariyerini korur; temizleme + buz sonrası nem dengesini geri verir.",
    steps: ["Temizlikten sonra nemlendiriciyi uygula", "Gündüz güneş varsa SPF'li tercih et"],
    tips: ["Buz + temizleme jeli ile aynı rutine bağla — unutma şansı kalmasın."],
  },
  ingilizce: {
    summary: "Günün İngilizce dersini yap + kelime defterine ekle.",
    why: "Creative Director yolunda İngilizce kilit. Günde küçük ama kesintisiz ilerleme bileşik büyür.",
    steps: [
      "İngilizce360'ta sıradaki dersi aç",
      "Dersi izle (uzunsa 2 güne böl)",
      "Deftere 3-5 yeni kelime/kalıp yaz",
    ],
    tips: ["Taban gün (yorgun): sadece 5 kelime yaz — gün yine tamam, zincir kırılmaz."],
  },
};

export function getHabitDetail(key: string): HabitDetail | null {
  return HABIT_DETAILS[key] ?? null;
}
