# Handoff — Sprint-3 Kapanış (2026-07-14)

> **DÜZELTME (2026-07-14, FINALIZATION sprinti Faz 0 truth gate):** Bu
> dokümandaki bazı ifadeler bağımsız yeniden-koşumda DOĞRULANAMADI:
> 1. "lint 0/0" — e3ef15a'da FAIL: `OpsMetricsBar.tsx:41`
>    `react-hooks/set-state-in-effect` (1 error). Düzeltme FINALIZATION
>    Faz 0'da (useSyncExternalStore, davranış korunarak).
> 2. "golden persuasion seti" 10 örnektir; 5 sektör × 6 rol × 3 aşama = 90
>    kombinasyon matrisi YOKTUR; judge prompt'u CI'da çağrılmaz.
> 3. "test:coverage tüm eşikler" yalnız CONFIG'TE LİSTELİ dosyalar içindir.
>    Eşik dışı kritik modüller düşük: outboundGate 11.76L/0B, coldEmail
>    29.57L/18.94B, voiceDna 62.5L/43.75B, cockpit/today 14.15L/5.98B.
> 4. "Faz 0-7 TAMAM / otonom işler bitti" fazla iddialı: Telegram
>    unledgered-send üretim yolu, /taslak'ın legacy first_message kullanımı,
>    evidence'ın yalnız yazılıp okunmaması, follow-up'ın görünmez agent_task
>    üretmesi ve proposal çıktılarının gerçek gate'te bloke olması açık KOD
>    işleridir — FINALIZATION sprintinde ele alınıyor.

Worktree: `agency-os-v2-sprint0` · Branch: `feat/agencyos-v2-sprint0`
Başlangıç HEAD: `0118a00` → Kapanış HEAD: bu dokümanı içeren docs commit'i
(`git log --oneline -1`; kod fazlarının sonuncusu `a4cc8d0`).

## Goal
Sprint-3 Faz 0-8: doküman/test gerçeği → Telegram teslimat doğruluğu →
sequences dayanıklılık → kanıt tabanlı ikna + Voice DNA → outreach UX →
teklif motoru → migration onay paketi (DUR) → Gmail planı → (onaysız
YAPILAMAYAN) Telegram canlı aktivasyon.

## Commits (her faz ayrı)
| Faz | Commit | Öz |
|---|---|---|
| 0 | c5ab3ec | coverage kapısı FAIL→yeşil (gmail/auditCompliance eşik-altıydı); handoff HEAD düzeltme; npm audit belgesi (2 moderate, next vendored postcss, --force YASAK); convert auditRecorded şeffaflığı |
| 1 | 14cb864 | Telegram durable outbox v2: ambiguous/definite sınıflandırma, 23505 status'a göre çözüm (failed→takeover, unknown→ASLA oto-resend), reply teslimi authoritative (teslim edilmeyen cevap = claim fail + 500), lifeDb parite diagnostics, reconcile_reply; coverage eşikleri route/replyDelivery/salesHandlers/updateClaims/client ≥90L/85B |
| 2 | fd0cc35 | sequences v2: CAS-idempotency (eşzamanlı cron tek task), task-fail→adım done kalmaz, crash-retry dedupe, opt-out/reply STOP, suppression fail-closed, iş-günü ertelemesi, followupAngles gerçek akışta (auto_send:false) |
| 3 | 90b7f50 | structured cold email (claims→evidenceId) + mig 062 hazır + Voice DNA hataları yutulmaz (banned-phrase okunamazsa kapı fail-closed) + onaylı stil kuralları prompt'a + T1/T2/T3/T5 kanıtsız şablonlar KODDAN temizlendi + golden persuasion seti (10 örnek, 8 kriter, CI'da deterministik) |
| 4 | 081bf88 | inline DraftEditor (/bugun + drawer): ihlal→metin bölgesi, 'İhlalleri düzelt' (deterministik), 'Onaya al' GERÇEK finalBody ile (boş {} kalktı); cold-email canonical primary resolver (keyfi en-eski contact YASAK); resolver/today hataları panel error (sahte boş-durum yok); OpsMetricsBar (gerçek süre + tamamlanan gelir aksiyonu); E2E login rate-limit izole-ortam düzeltmesi |
| 5 | 7096471 | proposalService API/UI: tek-transaction RPC (061 v2) + güvenli-sıra legacy (version-fail → current_version İLERLEMEZ), geçiş grafı ('sent' yolu YOK), approved YALNIZ approval satırı+versiyon+digest ile; approvals→versions bileşik FK; ≥90L/85B (94.9/86.1, 38 test) |
| 6 | 52e62fd | 059 deterministik cleanup (created_at,id) + eşit-timestamp DB-kanıtı; onay paketi dokümanı; DURDU — onay bekliyor |
| 7 | a4cc8d0 | Gmail/reply/gelir döngüsü kod+güvenlik planı (provider işlemi YOK) |

Kapılar (son ağaçta, a4cc8d0 içeriğiyle): tsc ✓ · lint 0/0 ✓ ·
**test:coverage 1058/1058 EXIT=0 (CONFIG'TEKİ TÜM EŞİKLER)** ✓ · build ✓ ·
**Playwright 51/51 ×2** (production build, izole test DB) ✓ · git diff --check ✓ ·
prod DB'de sıfır test izi (test DB afterAll temizliği + canlı DB'lere salt-okunur).

## Durum sınıflandırması (dürüst etiketler)
- **Yalnız kodlandı:** Faz 7 planındaki OAuth/ingest/FSM kod adımları (henüz yazılmadı — plan).
- **Kodlandı + unit testli:** yukarıdaki tüm Faz 0-5 modülleri (vitest 1058).
- **Kodlandı + E2E testli (izole test DB, production build):** kokpit akışları
  (satır aksiyon, inline contact, DRAFT EDİTÖR ihlal→düzelt→onay, HITL onay→
  dry-run send, convert eşzamanlılık, outbound gate, Telegram success-path/
  duplicate/takeover) — 51 test ×2 ardışık.
- **Test DB migration'lı:** LIFE-mimic 006 v3 ALTER (yalnız test DB) +
  transactional uygulanabilirlik provası (058-062, rollback'li, iz yok).
- **Canlı migration'lı:** YALNIZ eski 005-LIFE/045/057. 058/059/060/061/062 +
  LIFE 006 v3 **CANLI DEĞİL — kullanıcı onayı bekliyor** (paket:
  docs/migration-approval-package-2026-07-13.md).
- **Gerçek provider ile kanıtlı:** HİÇBİRİ (GMAIL_SEND_ENABLED=false; Telegram
  webhook canlıda kayıtsız; gerçek send/inbound sıfır).
- **Revenue funnel ile kanıtlı:** HİÇBİRİ — "para kazanmaya hazır" DEĞİL.
  Doğru etiket: dry-run ready + supervised pilot adayı.

## Açık riskler / bilinenler (gizlenmedi)
- npm audit 2×moderate AÇIK (next vendored postcss; tek fix downgrade =
  kabul edilemez; upstream takipte — docs/security/npm-audit-2026-07-13.md).
- Migration'lar canlıya alınana dek legacy yollar aktif (atomic:false görünür);
  teklif kalıcı değil (schemaMissing açık hata); fencing/ledger yalnız izole E2E'de.
- Genel coverage ~%47 civarı; kritik modüller eşikli, kalanlar değil
  (salesCommands/jarvis/life-asistan geniş yüzey).
- Canlı 44 first_message'ın 34'ü hâlâ ESKİ kanıtsız şablon metni taşıyor
  (yeni üretim temiz; canlı satır regenerasyonu VERİ değişikliği = onay ister).
- proposals API'lerinin kendi E2E'si yok (unit 38 test var; şema canlı değilken
  E2E schemaMissing'ten öteye gidemez — 061 onayı sonrası eklenmeli).

## Kullanıcıdan beklenen kararlar
1. **Migration onayı:** "058 059 060 061 062 ve 006 onaylı" → App+test DB
   birlikte + LIFE 006 + fingerprint yeniden üretimi + advisors + kapılar ×2 + commit.
2. **Deploy zinciri (kullanıcı aksiyonu):** git push → Vercel Promote →
   `APP_URL=https://agencyos-zeta-ashen.vercel.app node scripts/telegram-register-webhook.mjs`
   → "doğrula" yaz → Faz 8 gerçek-inbound doğrulaması koşulur (health, 401,
   getWebhookInfo URL eşleşmesi, diagnostics readiness+lifeDb paritesi, gerçek /bugun cevabı).
3. **Faz 7 dış konfig:** Google OAuth client + DNS kayıtları + bağımsız güvenlik
   incelemesi; sonrasında ayrı onayla GMAIL_SEND_ENABLED pilotu.

## Continue Prompt
"agency-os-v2-sprint0 worktree, branch feat/agencyos-v2-sprint0.
docs/handoffs/2026-07-14-sprint3-kapanis.md + .claude-resume.md +
docs/migration-approval-package-2026-07-13.md oku. Onay gelirse migration'ları
paketteki sırayla uygula (App+test birlikte, fingerprint yeniden üret,
advisors, kapılar ×2, commit). Kullanıcı push→Promote→webhook script sonrası
'doğrula' derse Faz 8 gerçek-inbound doğrulamasını koş ve PASS/FAIL raporla.
Pazarlıksız sınırlar aynen geçerli (push/deploy/canlı migration/webhook/gerçek
send onaysız YOK; GMAIL_SEND_ENABLED=false)."
