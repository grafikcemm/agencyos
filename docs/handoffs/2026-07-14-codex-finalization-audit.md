# AgencyOS V2 — Codex Finalization Audit (2026-07-14)

Worktree `agency-os-v2-sprint0` · branch `feat/agencyos-v2-sprint0` · base
`7c20b9b`. Push/merge/deploy/canlı migration/gerçek provider çağrısı yapılmadı.

## Hüküm

Kod tabanı supervised pilot için ciddi biçimde güçlendirildi ve kritik local/E2E
kapıları yeşil. Fakat canlı sistem şu anda para kazanmaya hazır değildir: canlı
şema geride, Gmail OAuth yok, scheduler planı yetersiz, Telegram LIFE ledger yok
ve gerçek send→reply→meeting→proposal→won zinciri kanıtlanmadı.

## Bu denetimde düzeltilenler

1. Production Gmail gerçek send açıkken UI’ın “dry-run” demesi engellendi.
2. Başarılı gerçek ilk send, cevapsız takip dizisini otomatik/idempotent kurar.
3. Follow-up kurulum hatası e-posta gönderildi gerçeğini bozmadan web/Telegram’da
   görünür; operatör neyin eksik kaldığını bilir.
4. Inbound sender doğrulaması mutable `leads.email` yerine gerçek outbound
   recipient snapshot’ına bağlandı; primary contact yanıtı doğru eşleşir.
5. Pilot health artık şema, Gmail flag/cursor/fresh heartbeat, scheduler planı,
   Voice DNA ve gerçek Telegram webhook eşleşmesi olmadan healthy dönmez.
6. Gmail ingest heartbeat’i yalnız başarılı gerçek turda yazılır.
7. OAuth revoke mutation’ı same-origin/CSRF ile korundu.
8. 30 dakikalık plan doğrudan ilgili satıra götürür; kokpitte gezinme azalır.
9. Dry-run ve boş provider ID operasyon/gelir metriğini şişiremez.
10. İkna KPI’sı hiç yazılmayan `replied` statusundan çıkarıldı; gerçek email
    ledger + reply FSM kullanır. Auto-reply/opt-out pozitif değildir; 20 gerçek
    gönderimden önce performans etiketi “VERİ BEKLİYOR”dur.
11. E2E bootstrap’a LIFE test DDL’i eklendi; cleanup hataları artık test komutunu
    kırar ve global teardown sıfır artığı kanıtlar.

## Kapılar

| Kapı | Sonuç |
|---|---|
| TypeScript | PASS |
| ESLint | PASS — 0 error / 0 warning |
| Vitest coverage | PASS — 125 dosya, 1683/1683, config eşikleri yeşil |
| Next production build | PASS — Next 16.2.10, 83 route |
| Playwright | PASS — 74/74 ×2 ardışık, izole test DB |
| E2E cleanup | PASS — her tur sonunda 0 artık |
| `git diff --check` | PASS |
| Canlı App DB E2E izi | PASS — 0 |
| npm audit | 2 moderate açık; Next vendored PostCSS, fix breaking downgrade |

E2E logunda görülen `daily_v2 PGRST205`, izole test DB’ye DDL’in henüz
uygulanmamasıdır. DDL artık `e2e/schema/e2e-schema.sql` içinde; bağlı Supabase
oturumu test projesine migration yetkisi vermedi. Canlı LIFE DB’de `daily_v2`
200/READY olduğundan bu production tablo eksikliği değil, test-infra parite açığıdır.

## Canlı gerçeklik matrisi

| Alan | Durum | Sonuç |
|---|---|---|
| App migrations 058–064 | Uygulanmadı | Teklif, claim-evidence, OAuth state/quarantine canlı değil |
| LIFE 006 | Eksik | `telegram_outbound_deliveries` 404; Telegram gerçek pilot bloklu |
| Vercel scheduler | Hobby | 13 cron + subdaily schedule üretimde desteklenmez |
| Gmail OAuth/env | Eksik | Hesap bağlı değil; gerçek send/ingest yok |
| DNS + yasal | Doğrulanmadı | SPF/DKIM/DMARC, KVKK/İYS tamamlanmalı |
| Production deploy | Eski | Yerel branch production’da değil |
| Gerçek provider canary | Koşulmadı | Para/reply kanıtı yok |

## “Bitti” için nokta atışı son yol

1. **Migration onayı:** `Revize 058 059 060 061 062 063 064 ve LIFE 006 onaylı.`
2. LIFE 006 → App 058–064; fingerprint/advisors/kapılar.
3. Vercel Pro + gerekli env; Google OAuth consent; SPF/DKIM/DMARC; KVKK/İYS.
4. Açık push/deploy onayı → promote → Telegram webhook register/verify.
5. Önce read-only Gmail ingest canary, sonra ayrı onayla tek gerçek Gmail send;
   gerçek cevap ingest ve follow-up iptali doğrulaması.
6. 20 gerçek gönderimden sonra ikna sinyali; gerçek meeting/proposal/won kaydı.

Bu altı adım tamamlanmadan “para kazanmaya hazır” denmez. Kod artık bunu health
kapısıyla yapısal olarak da zorlar.
