# AgencyOS V2 — doğru Supabase ve düşük maliyetli yayın handoff'u

Tarih: 2026-07-14

Bu belge önceki `2026-07-14-codex-finalization-audit.md` içindeki canlı migration
durumunu geçersiz kılar. Kaynak worktree:
`C:\Users\alice\.gemini\antigravity\scratch\agency-os-v2-sprint0`.

## Doğru proje topolojisi

- App DB: `agencyos` — `dfedehslshfyqurudwgk` — ACTIVE_HEALTHY.
- LIFE DB: `xcqrkcacosjlmkdursff` — alışkanlıklar, günlük yaşam verisi ve Telegram
  dayanıklılık tabloları burada kalır.
- E2E DB: `luhvfbujwnlnpnoelzhg` — yalnız testler içindir; production ref'i kabul
  etmeyen fail-fast koruma aktiftir.
- `feedthegoat` AgencyOS App DB değildir ve bu çalışmada hedef alınmamıştır.

## Canlı migration gerçeği

Doğru App DB'ye aşağıdaki migration'lar sırayla uygulanmış ve migration geçmişinde
doğrulanmıştır:

- 058 `apply_lead_action_rpc`
- 059 `contacts_primary_tx`
- 060 `convert_lead_to_project`
- 061 `proposals`
- 062 `claim_evidence`
- 063 `followup_schedule_unique`
- 064 `gmail_vault`
- 065 `rpc_acl_hardening`

LIFE DB'de 006 Telegram claim/outbox migration'ı uygulanmıştır. Supabase'in
explicit rol grant davranışı nedeniyle `telegram_acquire_update` ayrıca
sertleştirilmiştir: yalnız `service_role` EXECUTE yetkisine sahiptir.

App DB'deki lead/contact/convert/proposal ve Gmail Vault RPC'leri canlıda tek tek
kontrol edilmiştir: `service_role=true`, `anon=false`, `authenticated=false`.
Yeni App tablolarında RLS açıktır. Advisor sonucu yeni ERROR üretmemiştir; kalan
tek security WARN eski `update_updated_at` search_path bildirimi, tek performance
WARN eski `settings` duplicate index bildirimidir.

## Bu turdaki kaynak değişiklikleri

- 065 RPC ACL hardening migration + geri alma dosyası eklendi.
- LIFE 006 kaynak migration'ı explicit `anon/authenticated` revoke ile hizalandı.
- Vercel Pro zorunluluğunu kaldırmak için resmi OpenNext Cloudflare adaptörü,
  Wrangler config ve statik asset header'ları eklendi.
- OpenNext Edge uyumluluğu için Next sayfa kapısı davranış korunarak
  `src/proxy.ts` → `src/middleware.ts` taşındı. API auth asıl güvenlik sınırı
  olmaya devam eder.
- Cloudflare Free'deki 5 cron trigger sınırına takılmamak için 13 mevcut cron
  GitHub Actions schedule'ına aynen aktarıldı. Gerekli repository secrets:
  `AGENCYOS_BASE_URL` ve `CRON_SECRET`.
- Sahte session cookie'nin korumalı sayfayı açamadığı E2E kanıtı eklendi.

## Kapılar

- TypeScript: PASS
- ESLint: PASS — 0/0
- Vitest coverage: PASS — 125 dosya, 1683/1683
- Next production build: PASS — 83 route
- Playwright: PASS — 75/75 ×2, production build, izole E2E DB
- E2E cleanup: PASS — iki turda da sıfır artık
- `git diff --check`: PASS
- OpenNext build: PASS (WSL/Linux)
- OpenNext workerd smoke: login 200, korumalı sayfa 307, geçerli login sonrası
  `/bugun` 200, yetkisiz Gmail API 401, CRON secret ile health cron 200
- Cloudflare Worker dry-run bundle: gzip yaklaşık 739 KiB; Free 3 MiB sınırının
  altında
- npm audit: 2 moderate; Next'in vendored PostCSS'i, mevcut tek otomatik çözüm
  Next 9'a breaking downgrade olduğu için uygulanmadı

İzole E2E sunucu logundaki `daily_v2 PGRST205`, E2E LIFE fixture'ının canlı LIFE
ile driftidir. Canlı LIFE DB'de tablo vardır; gerçek production eksiği değildir.
E2E hesabına erişim elde edilince `e2e/schema/e2e-schema.sql` yeniden uygulanmalıdır.

## Kalan dış adımlar

Kod ve veritabanı zemini hazırdır; aşağıdakiler dış sağlayıcı/hesap işlemleridir:

1. Cloudflare hesabı yetkilendir, Worker'ı yayınla ve domain/subdomain bağla.
2. Runtime ile build-time secret'ları eşleştir; özellikle `APP_PASSWORD` ve
   `APP_SESSION_SECRET` her iki aşamada da aynı olmalıdır.
3. GitHub repository secrets'i ekle ve schedule workflow'unu etkinleştir.
4. Google Workspace trial/planını kullanıcı ödeme ekranında onayladıktan sonra
   `info@grafikcem.com` mailbox'ını oluştur; eski IHS MX'i mailbox hazır olmadan
   değiştirme.
5. Workspace Gmail OAuth client oluştur, secret'ları deploy ortamına koy, sonra
   DNS SPF/DKIM/DMARC geçişini tamamla.
6. Yayın URL'sinde Telegram webhook register/verify yap.
7. Önce read-only Gmail ingest, sonra kullanıcının açık canary alıcı onayıyla tek
   gerçek Gmail send ve gerçek reply→FSM doğrulaması yap.

Push/deploy/Cloudflare OAuth/Google Workspace ücretli adımı ve gerçek provider
canary bu belge yazılırken yapılmamıştır.
