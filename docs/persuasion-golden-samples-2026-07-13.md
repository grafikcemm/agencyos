# Golden Persuasion Seti — insan onay örnekleri (Sprint-3 Faz 3)

Kaynak: `src/lib/outreach/persuasionEval.ts` (`PERSUASION_GOLDEN_SET`).
Deterministik değerlendirme CI'da her koşuda çalışır (`persuasionEval.test.ts`).
Model-judge (`buildJudgePrompt`) CI'da ÇAĞRILMAZ — operatör/batch değerlendirmesi
içindir ve aşağıdaki insan kararlarıyla kalibre edilir.

## Değerlendirme kriterleri (spec Faz 3.10)

| Kriter | Deterministik ölçüm |
|---|---|
| Türkçesi doğal | CAPS bağırma yok, ≤1 ünlem, ort. cümle ≤30 kelime |
| Sakin + kanıt odaklı ton | spam/aciliyet dili yok + gözlem cümlesi veya claim→evidence bağı |
| Spam/klişe yok | GENERIC_CLICHE + VOICE_BANNED_PHRASE yok |
| Uydurma iddia yok | tespit edilen her iddia SPESİFİK evidence_id ile eşli |
| İşletmeye özel | işletme/kişi adı metinde |
| Tek düşük-sürtünmeli CTA | tanınan CTA kalıplarından tam 1 cümle |
| İtiraz karşılama | follow-up/teklif aşamasında itiraz-azaltma cümlesi |
| Tekrar düşük | önceki metinlerle cümle-tekrar oranı <%30 |

## İnsan onayı gereken örnek kararlar

Aşağıdaki sınır durumlar deterministik lint'in TEK BAŞINA karar veremeyeceği
örneklerdir; model-judge + insan kararı kalibrasyonu için saklanır.
(Durum: **ONAY BEKLİYOR** — Ali Cem işaretleyecek: UYGUN / UYGUN DEĞİL.)

1. **Mizah dozu** — "Web siteniz tatilde galiba 🙂" açılışı: lint geçirir;
   sektör klinikse fazla laubali olabilir. → İnsan kararı: [ ] UYGUN [ ] DEĞİL
2. **Rakip kıyası (isimsiz)** — "Bölgedeki benzer klinikler online randevuya
   geçti" (kanıtla): doğru ama baskı hissi verebilir. → [ ] UYGUN [ ] DEĞİL
3. **Fiyat çıpası cold mesajda** — "Aylık paketler 15.000 TL'den başlıyor":
   şeffaf ama erken olabilir. → [ ] UYGUN [ ] DEĞİL
4. **Follow-up 5'te ikinci kanal önerisi** — "İsterseniz WhatsApp'tan da
   yazabilirim": düşük sürtünme mi, ısrar mı? → [ ] UYGUN [ ] DEĞİL

Karar verildikçe bu dosyada işaretlenir ve gerekli olanlar deterministik
kurala (lint/persuasionEval) dönüştürülür.

## Voice DNA enjeksiyon durumu (Faz 3.7 — dürüst sınıflandırma)

| Üretici | Enjeksiyon |
|---|---|
| Cold email (LLM) | ONAYLI pozitif/negatif kurallar sistem prompt'una girer ✔ |
| İlk mesaj/pitch (deterministik şablon, evidenceEngine) | şablonlar kanıt-güvenli yeniden yazıldı; yasak-ifade uygulaması kapıda ✔ |
| Follow-up (deterministik açı şablonları) | kapıda (banned phrases + lint) ✔ |
| Teklif (proposalService) | çift kapı (wa/email) banned dahil ✔ |
| Telegram satış cevapları | üretim değil mevcut taslak sunumu; kapı kokpitte ✔ |

Otomatik öğrenme YALNIZ öneri üretir (candidate) — profile geçiş yalnız
operatör onayıyla (`approveStyleRule`/`approveBannedPhrase`).
