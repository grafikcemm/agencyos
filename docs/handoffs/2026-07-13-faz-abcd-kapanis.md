# Handoff — AgencyOS V2 Faz A-D Kapanışı (üretim-hazırlık + gelir-operasyonu)

**Tarih:** 2026-07-13 · **Branch:** `feat/agencyos-v2-sprint0` (worktree `../agency-os-v2-sprint0`) · **Base:** 2a63d41 · **HEAD:** d5e1a25 · **PUSH: classifier engeli — interaktif oturum gerekiyor (aşağıda)**

## Goal
Faz A-F sprinti: kapsamlı test tabanı + Telegram P0 + /bugun kokpit 1.2-1.5 + ikna motoru + (E-F: Gmail/teklif — dış konfig gerektirir).

## Commits (bu sprint)
| Faz | Commit | İçerik |
|---|---|---|
| B | 07382bb | Telegram P0: tek transport (message_id'siz başarı yok, redaction), orchestrator/retro sahte-başarı fix (send_failed+next_retry_at), fail-closed webhook auth (secret+chat+**TELEGRAM_USER_ID zorunlu**), Zod+64KB, durable update-claim, satış komutları taahhütten önce, "görev ekle" 1/2 TTL'li pending, bare onayla/gönder mutasyonsuz, canonical /bugun /aranacaklar /taslaklar /takipler /sorunlar /pipeline (web ile aynı katman), diagnostics route+panel |
| C+D-kısmi | 6cfbf30 | leadActions service (CAS+idempotency+audit), /api/leads/[id]/action, CallListPanel (5+backlog+süre+sıradaki), telefon dedupe (merge yok), 9-durum taslak darboğazı (approval'sız görünür), Reconcile butonu, İcraat nav-kaldırma, /dashboard→/bugun; qualityLint (10 golden test) advisory |
| — | 4c4eea3 | Asistan yardım/yetenek metinleri güncel satış komutlarını anlatıyor |
| DB | c360edf | mig 045+057 CANLI + test DB paritesi (62 tablo, byte-identical) + audit E2E kanıtı + cleanup |
| — | 5db346d | `scripts/telegram-register-webhook.mjs` (tek komut webhook kaydı; --check; secret yazdırmaz) |
| D | d5e1a25 | Rol-aware kişiselleştirme (ROLE_ANGLES + primary contact), Voice DNA v0 (silinen-cümle öğrenme, occurrence≥3 + operatör onayı, PII filtreli), contacts API, yasak-ifade okuyucu fix (settings key/value) |

## Kapanış kriterleri durumu
tsc ✓ · lint **0/0** ✓ · vitest **764/764** ✓ · build ✓ · **Playwright 37/37 ×2 ardışık** (23 ekran smoke + kokpit akışları + at-most-once/digest/suppression + mutation guard + şema drift + telegram auth 8) · test DB izole, artık sıfır ✓ · canlı DB'lerde test artığı sıfır (SQL doğrulandı) ✓

## Canlıya uygulananlar (kullanıcı onayıyla, MCP)
- **LIFE 005** (telegram_update_claims + telegram_pending_actions; RLS + revoke) — xcqrk…
- **App 057** (lead_action_audit) + **App 045** (contacts) — dfedeh…; advisors'ta YENİ uyarı yok.

## KRİTİK TESPİT
**Prod Telegram webhook URL BOŞ** (`getWebhookInfo` kanıtı: url boş, pending 0) → bot canlıda HİÇBİR inbound mesajı almıyor; "asistan cevap vermiyor"un kök nedeni bu.

## Bloke eylemler (güvenlik classifier'ı; interaktif oturumda 3 komut)
```bash
cd c:/Users/alice/.gemini/antigravity/scratch/agency-os-v2-sprint0
git push origin HEAD:feat/ftg-merge            # prod ref (fast-forward; prod tüm target:production deploy'ları bu ref'ten)
# Vercel: oluşan build'i Production'a Promote (veya npx vercel --prod)
node scripts/telegram-register-webhook.mjs      # webhook kaydı (önce --check ile bakılabilir)
```
Not: `TELEGRAM_USER_ID` Vercel'de mevcut (kullanıcı beyanı) → yeni fail-closed webhook deploy'da çalışır. Webhook kaydı deploy'dan önce de yapılabilir (eski prod kod da secret doğruluyor) — asistan hemen ayağa kalkar.

## Kararlar
1. Telegram sahte-başarı: message_id yoksa "gönderildi" yok; başarısızlık send_failed+next_retry_at; log yalnız başarıda.
2. Webhook fail-closed: TELEGRAM_USER_ID zorunlu env; tüm auth DB yazımından önce.
3. Satış intent'leri taahhüt yakalayıcısından ÖNCE (deterministik parser; LLM'siz).
4. Draft darboğazı: 9 deterministik durum; approval'sız taslak gizlenmez; her durumda tek güvenli adım.
5. Voice DNA: yalnız operatörün SİLDİKLERİ öğrenilir; otomatik yasak yok; PII aday olamaz; lint yalnız onaylı listeyi uygular (şimdilik advisory).
6. Dedupe: telefon-anahtarlı, kanonik=sıradaki ilk; otomatik merge yok, review notu.
7. Keyfi-SQL exec RPC test DB'de yok (RCE yüzeyi) — parity el-yazımı DDL + fingerprint.

## Bilinen sınırlar / riskler
- Gerçek Telegram inbound NOT RUN (webhook kaydı bekliyor); gerçek Gmail NOT RUN (OAuth+Vault+DNS+KVKK — Faz E önkoşulu, doc 32).
- "Para kazanmaya hazır" DEĞİL: kanıtlı zincir lead→arama→aksiyon→taslak→HITL→dry-run→reconcile; gerçek gönderim/reply/teklif halkaları Faz E-F.
- qualityLint advisory (blocking geçiş Voice DNA kalibrasyonu sonrası bilinçli).
- jarvis/engine pitch yolları salt metin (telegram prepare_draft gerçek kayıt üretiyor); engine %0 coverage.
- Ana repodaki eski `.claude-resume.md` dokunulmadı (bayat — güncel olan worktree'de).

## Next
1. (kullanıcı, interaktif) 3 komut: push → promote → webhook kaydı.
2. Deploy sonrası: Ayarlar > Telegram Asistan Durumu panelinden doğrula; bota `/bugun` yaz → satış özeti gelmeli (gerçek inbound testi).
3. Faz D kalanı: contacts drawer UI + Voice DNA aday-onay UI + lint'i blocking yap.
4. Faz E (ayrı güvenlik-incelemeli oturum): OAuth+Vault (doc 32) → reply ingest → follow-up FSM. Faz F: teklif motoru (mig 048/049) + gelir analitiği.

## Continue Prompt
```
AgencyOS V2'ye HEAD d5e1a25 üzerinden devam et. Worktree ../agency-os-v2-sprint0
(her komutta explicit cd; cwd ana repoya sapabiliyor). Önce oku: bu handoff +
.claude-resume.md. Faz A-D TAMAM; mig 005/045/057 CANLI. Kullanıcı push+promote+
webhook kaydını yaptıysa: prod'da /api/telegram 401 (secretsiz) + Ayarlar
diagnostics + gerçek inbound '/bugun' testini doğrula ve PASS/FAIL raporla.
Sonra: Voice DNA aday-onay UI + contacts drawer + lint blocking; ardından Faz E
OAuth (doc 32, bağımsız güvenlik incelemesi). Pazarlıksız: HITL'siz gönderim yok,
GMAIL_SEND_ENABLED=false, migration onaylı, secrets yazılmaz, her faz kapı+commit.
```
