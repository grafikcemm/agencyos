# Handoff — FINALIZATION / REVENUE-READY Sprinti Kapanış (2026-07-14)

Worktree: `agency-os-v2-sprint0` · Branch: `feat/agencyos-v2-sprint0`
Base HEAD: `e3ef15a` → Kapanış: bu dokümanı içeren commit (kod fazlarının
sonuncusu `0fbbc4c` + kapanış commit'i).

## Goal
Sprint tanımı: yeni özellik değil BİTİRME — web ve Telegram'ın aynı canonical,
evidence-backed, Voice-DNA'lı satış servislerini kullanması; lead → draft →
approval → dry-run → follow-up → proposal akışının GERÇEK yeni şema üzerinde
uçtan uca çalışması.

## Commits (her faz ayrı)
| Faz | Commit | Öz |
|---|---|---|
| 0 | e987bb7 | Truth gate: lint FAIL reprodüksiyon + useSyncExternalStore fix; kapanış raporu YANLIŞLARI düzeltildi (lint 0/0 üretilemiyordu; golden set 10'du; kritik coverage eşik dışıydı) |
| 1 | bba97dc | Canonical outbound artifact: outreach_message_versions + claim_evidence v2 (mig 062 v2, test DB'ye KALICI); iddia eşlemesi HER kapı noktasında SERVER-side remap (client'a güven kalktı); semantik kanıt-uyum matrisi (CLAIM_EVIDENCE_MISMATCH) + taxonomy genişletme; e2e/evidence.spec (3) |
| 2 | 6ac5e37 | GERÇEK 5×6×3=90 kombinasyon persuasion matrisi (180 sınır örneği CI'da); rol_uyumu/manipulasyon_yok/uzunluk_uygun kriterleri; judge OFFLINE CI runner (fixture, 'pending human calibration' dürüst etiketli; PERSUASION_JUDGE_LIVE=1 canlı); buildVoicePromptBlock TEK ortak Voice bloğu; voiceDna 100L/90B |
| 3 | e16287d | Follow-up DİKEY: due adım → GÖRÜNÜR canonical taslak (/bugun) + versiyon + adım↔taslak bağı (kaybolmaz); bağlam sorguları fail-closed; iptal hatası fırlar; mig 063 (schedule kısmi UNIQUE, test DB'ye KALICI); sahte 'somut gözlem' cümlesi silindi; e2e/followup.spec (3: dikey + opt-out + eşzamanlı-cron-exactly-once) |
| 4 | a6cee65 | Teklif motoru GERÇEK: builder çıktıları mocksuz gerçek gate'ten geçer (opt-out + tanınan CTA; salesPromise outbound metinden ÇIKTI — süreç/çıktı dili); onay/karar TEK-tx RPC (061 v3, test DB'ye KALICI); LeadDrawer teklif yönetimi UI; application service (listProposalsForLead/getProposalDetail); GERÇEK-ŞEMA BUG'I yakalandı+düzeltildi (leads.pain_points yok → pain_signals); e2e/proposals.spec (4: atomic RPC kanıtı + stale digest/versiyon bloke) |
| 5 | 143459d | Telegram parity + exactly-once: ÜRETİMDE unledgered gönderim KALDIRILDI (şema eksik → provider çağrılmaz + actionable teşhis); ledger'sız belirsiz sonuç 'unknown' (resend yapısal yok); 'cold email hazırla' → web ile AYNI coldEmailService; YENİ komutlar (taslak durumu / onaya al / teklif hazırla / teklifleri göster / reconcile); lead-sorgu hatası ≠ 'bulunamadı'; E2E fake-ambiguous (unknown + retry'da TEK satır attempt=1 + mutation-once) |
| 6 | d941550 | Migration paketi v2: 058/059/060 test DB'ye KALICI SIRALI; E2E LEAD_ACTION_RPC_REQUIRED=true (legacy fallback E2E'de KAPALI — 'audit degraded' logu kayboldu); advisors analizi; onay paketi docs/migration-approval-package-2026-07-14.md → **DURDU** |
| 7 | 0fbbc4c | Gmail/reply ÜRETİM KODU: OAuth start/callback (HMAC state + PKCE + scope allowlist fail-closed), Supabase Vault token (mig 064, DÜZ METİN YOK, rotation/revoke, test DB roundtrip kanıtı), inbound ingest + deterministik FSM (opt-out→suppression+do_not_contact; insan cevabı→responded+follow-up DURUR; auto-reply mutasyonsuz), shadow-mode cron; e2e/gmail-ingest.spec (3) |

## Bağımsız kapı çıktıları (SON ağaçta)
- `npx tsc --noEmit` ✓ · `npm run lint` **0 error / 0 warning** ✓
- `npm run test:coverage` **1453/1453 EXIT=0** — config'teki TÜM eşikler dahil
  YENİ kritik eşikler: outboundGate 100/91 · claimEvidence 100/85.7 ·
  qualityLint 98/87.5 · coldEmail 100/94.7 · voiceDna 100/90.2 ·
  persuasion{Eval,Judge,Matrix} · sequences 100/86.6 · followupAngles ·
  cockpit/today 100/86.2 · proposalBuilder 100B(izole)/eşik 90-85 ·
  proposalService 96.9/88 · telegram route/replyDelivery/salesHandlers
  (99.5/90.8)/updateClaims/client · gmail/sendMachine/auditCompliance/models.
- `npm run build` ✓ (E2E webServer her koşuda production build alır)
- `npm run test:e2e` **66/66 ×2 ardışık** (production build, izole test DB,
  LEAD_ACTION_RPC_REQUIRED=true) ✓ · `git diff --check` ✓ · working tree temiz
- `npm audit --omit=dev`: **2 moderate AÇIK** (next'in vendored postcss'i;
  tek fix next@9'a downgrade = kabul edilemez; --force YASAK; upstream takipte)

## Gerçek E2E funnel kanıtı (fake provider, gerçek route+şema)
- Cold: kayıtlı kanıt bağı → server gate PASS → edit remap → onay → dry-run send
- Follow-up: due → cron → görünür taslak → gate → onay → dry-run send → sent;
  opt-out → taslak yok; eşzamanlı cron → exactly-once
- Proposal: create(atomic RPC) → request → approve/reject; revize→eski onay RED;
  stale digest bloke
- Reply: dry-run sent → fake inbound → attribution → responded → follow-up
  İPTAL → opt-out 'ret' → suppression → SONRAKİ onay isteği 422
- Telegram: success/duplicate/takeover/ambiguous-unknown-no-resend/mutation-once
  + /reconcile görünürlüğü

## Migration durumu (dürüst)
- **YALNIZ izole E2E test DB'de (KALICI):** 058, 059 v2, 060, 061 v3, 062 v2,
  063, 064 + LIFE-mimic 006 v3. expected-fingerprint.json = KANONİK HEDEF.
- **CANLIDA:** yalnız eski 005-LIFE/045/057. **Paket canlıya UYGULANMADI.**
  Onay cümlesi: **"Revize 058 059 060 061 062 063 064 ve LIFE 006 onaylı."**
  (paket dokümanı 058-063+006 yazar; 064 Faz 7'de eklendi — onayda dahil edilmeli.)
- SIRA ZORUNLULUĞU: LIFE 006 canlıya alınmadan deploy+webhook YAPILMAMALI
  (üretimde unledgered yol kalktı → Telegram cevapları fail-closed 500 olur).

## Gerçek provider durumu (dürüst)
- Gmail/Telegram GERÇEK provider ÇALIŞTIRILMADI. Tüm send'ler dry-run; tüm
  inbound'lar fake transport. 'Gerçek provider ile kanıtlı' etiketi YOK.
- Kullanıcı aksiyonları (kod hazır, bunlarsız açılamaz):
  1) Google OAuth client + redirect URI + Vercel env (GOOGLE_CLIENT_ID/SECRET,
     GMAIL_OAUTH_REDIRECT_URI) → /api/gmail/oauth/start consent akışı
  2) DNS SPF/DKIM/DMARC   3) KVKK/İYS hukuki teyit
  4) Bağımsız güvenlik incelemesi (OAuth/vault/ingest)
  5) Ayrı onaylar: GMAIL_INGEST_ENABLED=true → gözlem → GMAIL_SEND_ENABLED
     pilotu (mesaj-başı HITL kalır) · FOLLOWUP_FSM_ENABLED kapalı
  6) Migration onayı → sonra push → Vercel Promote → LIFE 006 → webhook script
     → 'doğrula' (gerçek inbound doğrulaması)

## Açık riskler / kalanlar (gizlenmedi)
- npm audit 2×moderate AÇIK (yukarıda).
- Judge fixtures + insan-onay örnekleri 'pending human calibration' —
  PERSUASION_JUDGE_LIVE koşusu + operatör kalibrasyonu yapılmadı.
- Canlı 44 first_message'ın ~40'ı ESKİ kanıtsız şablon (kod yeni üretimde
  temiz + wa.me prefill gate'li; canlı satır regenerasyonu = VERİ değişikliği
  → ayrı onay ister; plan: onay sonrası kokpitten lead-başına yeniden üretim).
- id_token JWKS doğrulaması pilot güvenlik incelemesi maddesi.
- Genel coverage %~55; kritik modüller eşikli (geniş yüzeyler: jarvis/asistan).
- **'PARA KAZANMAYA HAZIR' ETİKETİ HÂLÂ VERİLEMEZ**: gerçek gönderim + gerçek
  cevap + ölçülmüş funnel yok. Doğru etiket: **dikey akışları gerçek şemada
  E2E-kanıtlı, dış-konfig bekleyen supervised-pilot adayı.**

## Continue Prompt
"agency-os-v2-sprint0 worktree, branch feat/agencyos-v2-sprint0.
docs/handoffs/2026-07-14-finalization-kapanis.md + .claude-resume.md +
docs/migration-approval-package-2026-07-14.md oku. Onay cümlesi ('Revize 058
059 060 061 062 063 064 ve LIFE 006 onaylı') gelirse paketi dokümandaki sırayla
CANLIYA uygula (fingerprint doğrulaması + advisors + kapılar ×2 + commit).
Kullanıcı push→Promote→LIFE 006→webhook script sonrası 'doğrula' derse
gerçek-inbound doğrulamasını koş ve PASS/FAIL raporla. Pazarlıksız sınırlar
aynen: onaysız push/deploy/canlı migration/webhook/gerçek send YOK;
GMAIL_SEND_ENABLED=false."
