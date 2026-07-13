# Telegram teslimat doğruluğu v2 (Sprint-3 Faz 1) — 2026-07-13

## Kapatılan kusurlar (öncesi → sonrası)

1. **reply() sonucu yutulurdu** → handler'lar 200 döner, claim complete olurdu;
   kullanıcı cevabı hiç görmezdi. **Şimdi:** ReplyKit tüm teslimleri izler;
   herhangi bir zorunlu cevap `sent/deduped_sent` değilse claim
   `failUpdateClaim` + **500** (Telegram retry; ledger duplicate'i engeller).
2. **replyGuaranteed belirsiz hatada yeni delivery key ile İKİNCİ provider
   çağrısı yapardı** (timeout'ta mesaj gitmiş olabilir → duplicate).
   **Şimdi:** stripHtml retry YALNIZ **kesin** başarısızlıkta (4xx — Telegram
   "işlemedim" dedi). Belirsizde (timeout/5xx) ikinci çağrı ASLA.
3. **Her 23505 "deduped başarı" sayılırdı** — mevcut satır `failed` olsa bile.
   **Şimdi:** dedupe yalnız `sent` satıra; `failed` → kontrollü takeover
   (attempt+1, AYNI key); `unknown` → resend ASLA; `sending` taze → in-progress;
   `sending` bayat → `unknown`'a düşürülür (crash izi).
4. **Provider sonuç sınıflandırması yoktu.** client.ts artık `ambiguous`
   bayrağı döner: network timeout / 5xx / bozuk-200 = BELİRSİZ (unknown);
   4xx + 429-sonrası-429 + eksik env = KESİN (failed, retry güvenli).
5. **Ledger finalize başarısızlığı authoritative:** provider başarılı ama
   `sent` yazılamadıysa `sent_unrecorded` → claim complete EDİLMEZ (500);
   satır bayat-sending→unknown yoluyla manuel reconcile'a düşer.

Statüler: `pending/sending/sent/failed/unknown` (006 v3). Reconcile:
`POST /api/telegram/diagnostics {action:'reconcile_reply', deliveryKey,
decision: assume_delivered|mark_failed}` — yalnız `unknown` satır (CAS);
`retry_send` yok çünkü cevap metni ledger'da saklanmaz.

**Mutation-once (Faz 1.9):** komut yan etkileri claim + pending-consume +
update-scoped idempotency key'lerle korunur; "mutasyon başarılı + cevap
belirsiz" durumunda retry mutasyonu TEKRARLAMAZ (route.test kanıtı:
`active_tasks` tek satır kalır).

## "Invalid API key" kök neden analizi (Faz 1.10)

- `.env.local` doğrulandı (secret yazdırmadan, JWT payload ref/rol karşılaştırması):
  LIFE key `role=service_role, ref=xcqrkcacosjlmkdursff` = URL ref'i ✔;
  App key `ref=dfedehslshfyqurudwgk` = URL ref'i ✔. Canlı probe: **OK**.
- Sonuç: semptom LOKAL env'den üretilemiyor. Kök neden adayı: gözlendiği
  ortamın (Vercel runtime / E2E override) **env drift'i** — URL bir projeye,
  anahtar başka projeye ait veya anahtar rotasyon sonrası bayat.
- Kalıcı çözüm: `/api/telegram/diagnostics` artık `lifeDb` bloğu döner:
  `projectRefFromUrl / keyRole / keyProjectRef / refsMatch / probeOk /
  probeError` — secret sızdırmadan, arızanın olduğu ortamda kök neden
  tek bakışta görünür. (unverified: Vercel runtime değerleri — deploy sonrası
  diagnostics ile doğrulanacak.)

## Test kanıtı (unit, mock'lu; izole E2E ayrıca koşuyor)

network timeout → unknown · 429+retry_after → tek in-process retry ·
429-sonrası-429 kesin · 500/503 ambiguous · ilk-çağrı-ulaştı-cevap-kayboldu →
unknown + ikinci çağrı yok · failed satır sent SAYILMAZ · unknown'a oto-resend
yok · ledger finalize DB fail → sent_unrecorded/500 · claim finalize DB fail →
500 · lease takeover/fencing · eşzamanlı aynı update → tek provider çağrısı ·
mutation-ok+reply-fail → mutasyon tek. Coverage eşikleri vitest.config'e
sabitlendi: route/replyDelivery/salesHandlers/updateClaims/client ≥90L/85B.
