# Handoff — Sprint-2 Faz 0-5 Kapanış (2026-07-13)

Worktree: `agency-os-v2-sprint0` · Branch: `feat/agencyos-v2-sprint0` · HEAD: `0118a00`
(5265ccb = Faz 5 kod commit'i; 0118a00 = bu handoff'u içeren docs commit'i — sprint kapanış HEAD'i budur.)

## Goal
Üretim doğruluğu + gelir hazırlığı: P0 dayanıklılık (Faz 0), outbound kalite
bypass'larını kapatma (Faz 1), gerçek contact/"gir-hallet-çık" kokpiti (Faz 2),
proje/teklif gerçeği (Faz 3), Voice DNA + follow-up ikna motoru (Faz 4),
Telegram success-path E2E + readiness (Faz 5).

## Commits (her faz ayrı)
| Faz | Commit | Kapılar |
|---|---|---|
| 0 | 6a60e72 | vitest 800 · PW 38×2 |
| 1 | 6f777ff | vitest 812 · PW 41×2 |
| 2 | 0a81291 | vitest 824 · PW 42×2 · **/bugun p95 0.81s** |
| 3 | 12f83f8 | vitest 830 · PW 45×2 |
| 4 | a37fc0f | vitest 841 · PW 45×2 |
| 5 | 5265ccb | vitest 841 · PW **50×2** (success-path dahil) |
| docs | 0118a00 | handoff + resume EK-4 (kod değişikliği yok) |
Hepsinde: tsc ✓ · lint 0/0 ✓ · build ✓ · git diff --check ✓.
**DÜZELTME (Sprint-3 Faz 0):** yukarıdaki kapılarda `npm test` koşuldu; `npm run
test:coverage` AYRICA koşulmadı ve 0118a00'da FAIL ediyor — gmail.ts
(L85.92/S82.77/B78.97 < 90/90/85) ve auditCompliance.ts (L75.86/S67.6/B62.5 <
90/90/85) Sprint-2'de eklenen kodla mevcut eşiklerin altına düştü.
"Bütün kapılar yeşil" ifadesi coverage kapısını KAPSAMAZ.

## Durum sınıflandırması
**Kodlandı + Unit + E2E kanıtlı:** claim fencing + authoritative finalize (500-on-fail);
reply delivery ledger dedupe; reminder unknown_delivery + manuel reconcile; note-UUID
(aynı güne 2 not); canonical outbound gate (wa.me/copy/request-send BLOCKING, digest bağlı);
claim→SPESİFİK evidence; canonical recipient + digest'e contact bağı; inline contact;
kokpit batch (p95 0.81s); convert (tek proje, eşzamanlı-tık, audit); follow-up açıları +
stop kuralları; Voice DNA yapısal candidate→onay akışı; Telegram success-path
(claim→handler→App mutasyon→fake delivery→completed; duplicate; failed-takeover).

**Kodlandı, CANLI DEĞİL — KULLANICI ONAYI GEREKLİ (SQL+rollback hazır):**
- App **058** apply_lead_action · **059** contacts primary tx · **060** convert RPC ·
  **061** proposals (4 tablo) → App + test DB **BİRLİKTE** uygulanır.
- LIFE **006 v2** (fencing token + delivery ledger).
- Uygulanana dek: ilgili yollar legacy (atomic:false görünür), teklif kalıcı değil,
  fencing/ledger canlıda yok (yalnız izole E2E'de kanıtlı). 058 canlıya alınınca
  `LEAD_ACTION_RPC_REQUIRED=true` ile legacy tamamen kapatılabilir.

**Canlı konfigüre edilmiş:** mig 005-LIFE, 045, 057; TELEGRAM_USER_ID (Vercel, kullanıcı beyanı).

**Dış kullanıcı aksiyonu bekliyor (bu oturumda YAPILAMAZ — sınır):**
push → Vercel Promote → `APP_URL=… node scripts/telegram-register-webhook.mjs` →
"doğrula" de → gerçek-inbound doğrulaması koşulur. Canlı webhook URL hâlâ BOŞ.

**Çalışmıyor / sonraki faz (Faz 6 dışı-konfig arkası):** Gmail OAuth+Vault + DNS
SPF/DKIM/DMARC + reply ingest/classification + FOLLOWUP_FSM + gerçek provider send
(ayrı güvenlik incelemesi + açık onay şart) + KVKK/İYS bağımsız inceleme + proposal
delivery tracking. GMAIL_SEND_ENABLED=false KORUNDU.

## Kararlar (nedenleriyle)
- Exactly-once İDDİA EDİLMEZ: provider idempotency yok → at-most-once + unknown/manuel
  reconcile (şüphede sessizlik > duplicate).
- Fake transport yalnız BOŞ token'la aktif — token'lı ortamda yapısal imkânsız.
- LIFE-mimic tablolar fingerprint'ten adıyla dışlandı (App-parite bozulmadan izole E2E).
- Canlı 44 first_message'ın 34'ü kanıtsız iddialı (T1/T2/T5) — docs/first-message-risk-audit;
  veri DEĞİŞTİRİLMEDİ, tüm çıkışlar yapısal bloklu; yeniden üretim onay ister.

## Bilinen sınırlar / riskler
- Legacy yollar (058/059/060 öncesi) crash pencereli — atomic:false görünür, dokümante.
- Batch suppression `.in` (exact, lowercase) vs tekil `ilike` — normalize edilmiş; karışık
  büyük harfli manuel suppression satırı teorik sapma (fail-closed yönlü değil; not).
- Coverage genel ~%45; salesHandlers/sequences hedef altı (rapor edildi, gate'e takılmadı).
- Bir kez gözlenen tek E2E flake (Faz 4 ön-koşusu) — ardışık kopyalar temiz.

## Continue Prompt
"agency-os-v2-sprint0 worktree, branch feat/agencyos-v2-sprint0, HEAD 0118a00.
docs/handoffs/2026-07-13-sprint2-faz0-5-kapanis.md ve .claude-resume.md EK-4'ü oku.
Onay verilirse: mig 058+059+060+061'i App+test DB'ye BİRLİKTE, 006'yı LIFE'a uygula,
fingerprint'i App'ten yeniden üret, kapıları ×2 koş. Kullanıcı push→Promote→webhook
script'ini çalıştırıp 'doğrula' derse gerçek-inbound doğrulamasını yap."
