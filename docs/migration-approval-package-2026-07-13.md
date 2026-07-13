# Migration Onay Paketi — Sprint-3 Faz 6 (2026-07-13)

**DURUM: DURDU — kullanıcı onayı bekleniyor. Hiçbir canlı DB'ye uygulanmadı.**

## Bekleyen migration'lar

| # | Dosya | Amaç | Rollback |
|---|---|---|---|
| App 058 | `migrations/058_apply_lead_action_rpc.sql` | lead aksiyonu tek-transaction (idempotency+audit) | ✔ var |
| App 059 v2 | `migrations/059_contacts_primary_tx.sql` | tek-primary partial unique + create/switch RPC; **cleanup artık (created_at DESC, id DESC) deterministik — eşit timestamp çifti tek primary'ye iner (test kanıtlı)** | ✔ var |
| App 060 | `migrations/060_convert_lead_to_project.sql` | Projeye Dönüştür atomik RPC + projects_lead_unique + audit 'convert' | ✔ var |
| App 061 v2 | `migrations/061_proposals.sql` | proposals 4 tablo + **approvals→(proposal_id,version) FK** + **create_proposal_version_tx RPC** | ✔ var |
| App 062 | `migrations/062_claim_evidence.sql` | iddia→kanıt kalıcı izi (outreach_claim_evidence) | ✔ var |
| LIFE 006 v3 | `supabase/life-migrations/006_telegram_claim_state.sql` | claim fencing + delivery ledger **v3: attempt_count/claimed_at + 'pending' statüsü** | ✔ var |

## Kanıtlar (2026-07-13)

1. **Uygulanabilirlik provası (test DB, transactional):** 058+059v2+060+061v2+062
   tek `BEGIN…ROLLBACK` içinde sorunsuz uygulandı; ek olarak **059 eşit-timestamp
   determinizm testi** (aynı `created_at` ile iki primary → cleanup sonrası TEK
   primary, kazanan `(created_at DESC, id DESC)` sırasının ilki) transaction
   içinde doğrulandı. Sonuç satırı:
   `TUM_DDL_UYGULANABILIR_VE_059_ESIT_TS_DETERMINISTIK`. Kalıcı iz YOK (rollback).
2. **Explicit grant/revoke:** her yeni tablo/fonksiyonda `revoke … from
   anon, authenticated` + `grant … to service_role` satırları mevcut (Supabase
   Data API explicit-grant davranışı); RLS tüm yeni tablolarda enable.
   Uygulama kodunun grant'lere bağımlılığı unit testlerle sürülüyor
   (contactService/convertLead/proposalService RPC-first testleri).
3. **Unit + E2E:** ilgili kod yolları hem RPC-first hem legacy fallback ile
   test edildi (vitest 1058; Playwright suite'i legacy yolda çalışıyor —
   migration'lar canlıya alınınca atomic:true yolları devreye girer).
4. **LIFE 006 v3:** test DB LIFE-mimic tablosuna ALTER uygulandı (E2E bu
   şekille koşuyor); canlı LIFE'a DOKUNULMADI.

## Onay sonrası uygulama sırası (tek oturumda)

1. App DB (dfedeh…) + test DB (luhvfb…) — **BİRLİKTE**: 058 → 059 → 060 → 061 → 062.
2. `e2e/schema/expected-fingerprint.json` App DB'den yeniden üret (yeni public
   fonksiyonlar functions_md5'i değiştirir).
3. LIFE DB (xcqrk…): 006 v3.
4. Migration başlıklarını "✔ CANLIDA (tarih)" olarak güncelle.
5. Supabase advisors koş (App + LIFE) — yeni bulgu yoksa devam.
6. Tam kapılar ×2 (vitest + Playwright) → commit.
7. (Opsiyonel, 058 canlı doğrulandıktan SONRA) `LEAD_ACTION_RPC_REQUIRED=true`.

## Onay cümlesi

Uygulamam için şunu yazman yeterli: **"058 059 060 061 062 ve 006 onaylı"**
(bir kısmını onaylamak istersen numaralarını yaz).
