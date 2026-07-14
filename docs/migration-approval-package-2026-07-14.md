# Migration Onay Paketi v2 — 2026-07-14 (FINALIZATION sprinti, Faz 6)

Bu paket 2026-07-13 paketinin YERİNİ ALIR (docs/migration-approval-package-2026-07-13.md
tarihsel kayıttır). Fark: 061 v3 (onay/karar tx RPC'leri), 062 v2 (canonical
outbound artifact — versiyon tablosu), YENİ 063 (follow-up schedule kısmi
unique) ve test-DB doğrulama modeli değişti: **rollback-provası değil, KALICI
uygulama + gerçek-şema E2E**.

## Paket içeriği (App DB — dfedehslshfyqurudwgk)

| Mig | v | İçerik | Rollback |
|---|---|---|---|
| 058 | v1 | `apply_lead_action` tek-tx RPC (idempotency+geçiş+audit) | 058_..._rollback.sql |
| 059 | v2 | contacts tek-primary kısmi UNIQUE + deterministik ön-temizlik `(created_at DESC, id DESC)` + `create_contact_tx`/`set_primary_contact` | 059_..._rollback.sql |
| 060 | v1 | `convert_lead_to_project` tek-tx RPC + projects lead kısmi UNIQUE + audit 'convert' | 060_..._rollback.sql |
| 061 | **v3** | proposals/proposal_versions/proposal_approvals(+bileşik FK)/proposal_events + `create_proposal_version_tx` + **`request_proposal_approval_tx` + `decide_proposal_approval_tx`** + proposals DELETE grant (legacy telafi) | 061_..._rollback.sql (fonksiyonlar önce) |
| 062 | **v2** | **outreach_message_versions** (immutable versiyon: alıcı+içerik+content_digest+voice snapshot+gate sonucu) + outreach_claim_evidence v2 (VERSİYONA bağlı, claim_key/claim_category) + 061 koşullu FK bloğu | 062_..._rollback.sql |
| 063 | **v1 (YENİ)** | follow_up_sequences `(lead_id, step) WHERE done=false` kısmi UNIQUE + deterministik ön-temizlik | 063_..._rollback.sql |

## LIFE DB (xcqrkcacosjlmkdursff)

| Mig | v | İçerik |
|---|---|---|
| 006 | v3 | telegram_update_claims + telegram_outbound_deliveries (+attempt_count, claimed_at, 'pending') — DEĞİŞMEDİ (Sprint-3 paketiyle aynı) |

ÖNEMLİ (FINALIZATION Faz 5): üretim kodu artık ledger şeması eksikken provider'ı
HİÇ çağırmaz (unledgered fallback kaldırıldı). **LIFE 006 uygulanmadan deploy +
webhook kaydı yapılırsa Telegram cevapları fail-closed 500 döner** — sıralama:
önce LIFE 006, sonra deploy/webhook.

## Test-DB doğrulama modeli (yeni)

Paket, izole E2E test DB'sine (luhvfbujwnlnpnoelzhg) **KALICI ve SIRALI**
uygulandı (2026-07-14): 062v2 → 063 → 061v3(+062 FK bloğu) → 058 → 059 → 060.
- `e2e/schema/expected-fingerprint.json` artık **KANONİK HEDEF** şemadır
  (= canlı App DB + bu paket). schema-drift testi test DB'yi hedefe kilitler.
- E2E `LEAD_ACTION_RPC_REQUIRED=true` ile koşar: legacy fallback E2E'de KAPALI —
  suite gerçek RPC/tablo yollarını kullandığını yapısal kanıtlar (63 test ×2).
- Gerçek-şema E2E somut bir üretim bug'ı yakaladı ve düzeltildi:
  proposalService `leads.pain_points` diye VAR OLMAYAN kolonu seçiyordu
  (gerçek kolon `pain_signals`) — mock'lu unit'ler bunu göremezdi.

## Advisors (test DB, 2026-07-14)

Paket nesnelerine dair TÜM bulgular test-DB-ÖZEL e2e düzeninden kaynaklanır
(`e2e_open` always-true policy'ler + anon/authenticated EXECUTE grant'leri —
E2E anahtarı anon rolüyle çalıştığı için). **Üretim SQL dosyaları STRICT'tir**:
RLS açık + anon/authenticated REVOKE + yalnız service_role (fonksiyonlarda
`set search_path = public`). Canlı App DB baseline'ı değişmez:
`function_search_path_mutable update_updated_at` WARN + duplicate settings
index WARN dışında paketin yeni WARN/ERROR üretmesi beklenmez; onay sonrası
canlıda advisors yeniden koşulup raporlanır.

## Onay SONRASI uygulama sırası (canlı)

1. App DB (dfedeh…): 058 → 059 → 060 → 061(v3) → 062(v2) → 063 — her biri
   kendi dosyasından, sırayla. (059/063 ön-temizlikleri deterministik;
   canlıda 0 follow-up sequence ve bilinen contacts durumu ile risk düşük.)
2. `e2e_schema_fingerprint()` App DB'de koş → çıktı
   `e2e/schema/expected-fingerprint.json` ile BİREBİR eşleşmeli (test-DB-özel
   telegram_%/active_tasks zaten fingerprint dışında). Eşleşmiyorsa DUR.
3. LIFE (xcqrk…): 006 v3 (`supabase/life-migrations/006_telegram_claim_state.sql`).
4. Migration dosyalarının başlıklarını "✔ CANLIDA (tarih)" olarak güncelle + commit.
5. Advisors (App + LIFE) koş; baseline dışı bulgu varsa raporla.
6. Tam kapılar ×2 (tsc/lint/coverage/build/E2E ×2) + commit.
7. İSTEĞE BAĞLI (ayrı karar): Vercel'de `LEAD_ACTION_RPC_REQUIRED=true` —
   yalnız 058 canlıda doğrulandıktan sonra.

## Rollback / kurtarma

- Her migration'ın kendi `_rollback.sql`'i var; ters sırada uygulanır
  (063 → 062 → 061 → 060 → 059 → 058). 061 rollback'i fonksiyonları
  tablolardan ÖNCE düşürür. 059/063 rollback'leri index'i kaldırır;
  ön-temizlikte kapatılan duplicate satırlar VERİ düzeltmesidir, geri açılmaz
  (belgeli). LIFE 006 rollback: 006_..._rollback.sql (deliveries kolonları +
  claims tablosu).
- Kısmi başarısızlıkta: başarısız migration'ın rollback'i + fingerprint
  yeniden karşılaştırma; kod legacy yollarla çalışmaya devam eder
  (schemaMissing açık görünür) — UYGULAMA KIRILMAZ.

## ONAY

Canlı App/LIFE DB'ye uygulama YALNIZ şu açık cümleyle başlar:

> **"Revize 058 059 060 061 062 063 ve LIFE 006 onaylı."**

Kısmi onay (numara listesiyle) kabul edilir; sıra bağımlılıkları: 062, 061'e
(koşullu FK) ve kod 062'ye; 063 bağımsız; 058/059/060 bağımsız.
Onay gelene kadar canlı DB'lere HİÇBİR yazım yapılmaz (pazarlıksız sınır).
