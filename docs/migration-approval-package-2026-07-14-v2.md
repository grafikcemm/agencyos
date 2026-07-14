# Migration Onay Paketi v2 — FINAL PILOT BLOCKERS (2026-07-14)

> Bu, `migration-approval-package-2026-07-14.md`'nin REVİZE halidir. 064 bu
> sprintte v3'e (hesaba özgü Vault + oauth_states + quarantine) çıktı ve LIFE
> 006'ya `code` kolonu eklendi. Onay cümlesi aynı; içerik güncellendi.

## Kapsam

Paket, izole E2E test DB'sine (**luhvfbujwnlnpnoelzhg**) **KALICI ve SIRALI**
uygulandı; `expected-fingerprint.json` = kanonik hedef (= canlı App DB + bu
paket). CANLI App/LIFE DB'ye **UYGULANMADI** — kullanıcı onay cümlesi bekliyor.

| Migration | Öz | Bu sprintteki değişim |
|---|---|---|
| 058 | apply_lead_action / convert_lead_to_project RPC | değişmedi |
| 059 | create_contact_tx / set_primary_contact + tek-primary | değişmedi |
| 060 | projects lead kısmi UNIQUE + audit convert CHECK | değişmedi |
| 061 v3 | proposals + 3 tx RPC (create/request/decide) | değişmedi |
| 062 v2 | outreach_message_versions + claim_evidence v2 | değişmedi |
| 063 | follow_up_sequences kısmi UNIQUE | değişmedi |
| **064 v3** | Gmail Vault + **hesaba özgü secret** + **tek-tx connect/disconnect** + **gmail_oauth_states** (replay reddi) + **gmail_inbound_quarantine** | **REVİZE** (Faz 2/3) |
| **LIFE 006** | Telegram claim state + delivery ledger + **telegram_pending_actions.code** | **+code kolonu** (Faz 6) |

## Onay cümlesi

Tüm kapılar YEŞİL olduğunda kullanıcı şu cümleyle onaylar:

> **Revize 058 059 060 061 062 063 064 ve LIFE 006 onaylı.**

## Onay sonrası uygulama sırası (CANLI)

1. **LIFE 006** (xcqrk…) — telegram_pending_actions.code + claim state + ledger.
   *(Deploy+webhook'tan ÖNCE olmalı; aksi hâlde imzalı Telegram aksiyonu +
   reply ledger fail-closed olur.)*
2. **App 058 → 059 → 060 → 061 v3 → 062 v2 → 063 → 064 v3** (dfedeh…), SIRALI.
3. Her adımda `select e2e_schema_fingerprint()` App DB'de → expected-fingerprint.json
   ile karşılaştır (MİSMATCH → DUR).
4. Advisors (App + LIFE) — yeni ERROR/WARN yoksa devam.
5. Migration başlıklarını "✔ CANLIDA" işaretle.

## Advisors (test DB, 2026-07-14, revize paket sonrası)

- **Security:** 12 ERROR — HEPSİ pre-existing baseline (7 e2e `security_definer_view`
  fingerprint-helper view'ları + 5 LIFE-mimic `rls_disabled_in_public`). Yeni
  tablolarım (gmail_oauth_states, gmail_inbound_quarantine) **RLS-enabled**, ERROR'da
  YOK. WARN'lar (anon/authenticated security_definer executable, rls_policy_always_true)
  = **test-DB-only** e2e_open + anon-EXECUTE konvansiyonu (production SQL strict:
  service_role-only, e2e_open YOK). `function_search_path_mutable:1` = `update_updated_at`
  (baseline, benim fonksiyonlarım değil — hepsi `set search_path`'li).
- **Performance:** yalnız INFO (unindexed_fk / unused_index) + 1 `duplicate_index`
  WARN (settings_key_key/settings_key_unique — baseline). Yeni obje kaynaklı bulgu YOK.

## Production SQL vs Test DB farkı (dürüst)

- Repo `migrations/064_gmail_vault.sql` (v3): SECURITY DEFINER + sabit search_path
  + PUBLIC/anon/authenticated **revoke** + service_role-only EXECUTE. e2e_open YOK.
- Test DB'ye ek olarak (YALNIZ izole test düzeni): anon EXECUTE + e2e_open policy
  (E2E "service" key anon rolü gibi davranır). CANLI uygulamada bu eklentiler YOK.

## Rollback

Her migration'ın `*_rollback.sql`'i mevcut (064: fonksiyon + oauth_states +
quarantine + vault_read drop; secret'lar veri güvenliği için silinmez).
