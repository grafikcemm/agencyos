# FINAL PILOT BLOCKERS — Faz 0 Truth Gate (2026-07-14)

Worktree: `agency-os-v2-sprint0` · Branch: `feat/agencyos-v2-sprint0` ·
Base HEAD: `1d361704ed09abc7fa7307c0d2f58bf3a1c5105a` · Ağaç: temiz.

## Baseline kapılar (bu HEAD üzerinde)

- `npx tsc --noEmit` PASS (bu oturumda yeniden koşuldu)
- `npm run lint` 0 error / 0 warning PASS (bu oturumda yeniden koşuldu)
- `npm run test:coverage` 1453/1453 EXIT=0 — FINALIZATION kapanışında AYNI
  HEAD (1d36170, temiz ağaç) üzerinde koşuldu; ağaç değişmedi.
- `npm run build` PASS · Playwright 66/66 ×2 PASS — aynı şekilde bu HEAD'de.
- `npm audit --omit=dev`: 2 moderate AÇIK (next vendored postcss; değişmedi).
- Genel coverage ~%59.6 line / ~%53 branch (kritik modüller eşikli).

## 13 bulgunun bağımsız reprodüksiyonu (kod/DB kanıtı)

| # | Bulgu | Kanıt | Durum |
|---|---|---|---|
| 1 | Gerçek Gmail send yok | `src/lib/outreach/gmail.ts:516-530` — `createGmailRestTransport.send()` ve `findByRfcMessageId()` koşulsuz `GmailTransportError` fırlatır (bilinçli stub) | DOĞRULANDI |
| 2 | gmail-ingest cron kayıtsız | `vercel.json` crons listesinde `/api/cron/gmail-ingest` YOK (11 giriş var, ingest yok) | DOĞRULANDI |
| 3 | Schedule UI yanlış frekans | `src/app/(os)/schedule/page.tsx:29-33` "Her 10 dakikada bir" + `*/10 * * * *`; gerçek `vercel.json` agent-tick `0 9 * * *` (günde 1) | DOĞRULANDI |
| 4 | Scope zorunluluğu eksik | `src/lib/outreach/gmailScopes.ts:27-40` — yalnız allowlist-dışını reddeder; `gmail.send`+`gmail.readonly` İKİSİNİN varlığını ZORLAMAZ (boş küme bile ok:true) | DOĞRULANDI |
| 5 | id_token doğrulaması yok + unknown@unknown | `src/lib/gmail/oauth.ts:148-160` payload decode (JWKS/iss/aud/exp yok); `src/app/api/gmail/oauth/callback/route.ts:53` `?? 'unknown@unknown'` | DOĞRULANDI |
| 6 | Tek global Vault secret adı | `src/lib/gmail/tokenVault.ts:18` `VAULT_SECRET_NAME = 'gmail_refresh_token_primary'`; store→rotate SONRA account upsert (atomik değil) — ikinci hesapta eski satır yeni token'a işaret edebilir | DOĞRULANDI |
| 7 | Polling production-dışı | `src/lib/gmail/replyIngest.ts:262-266` `newer_than:3d&maxResults=25`, pagination yok, `last_history_id` kullanılmıyor, MIME yalnız ilk-seviye text/plain, From↔outreach recipient doğrulaması yok | DOĞRULANDI |
| 8 | coldEmailService test %0 | `src/lib/outreach/coldEmailService.test.ts` YOK; `vitest.config.ts` eşiği YOK | DOĞRULANDI |
| 9 | Canlı veri outreach'e yetersiz | Canlı App DB salt-okunur sorgu (2026-07-14): leads=134, email'li=8, contacts=0, evidence'lı lead=1 (6 satır), draft=3, sent=1, inbound=0, follow-up=0, converted=0 | DOĞRULANDI |
| 10 | Telegram HITL parity eksik | `src/lib/telegram/salesHandlers.ts:453-460` `handleGenericApprove` pending'i tüketip hiçbir işlem yapmaz; edit/approval-decision/send/proposal-decision/reconcile-decision komutu yok (yalnız görüntüleme+istek) | DOĞRULANDI |
| 11 | Voice DNA canlıda boş | Canlı `settings.voice_dna` = null (0 gözlem / 0 onaylı kural); 180 persuasion örneği sentetik şablon matrisi (persuasionMatrix.ts) | DOĞRULANDI |
| 12 | Kokpit 30dk hedefi + yanlış sağlık | `src/app/(os)/bugun/page.tsx:112` "reply ingest Sprint 2'de" metni duruyor; `/api/health/config` yalnız 8 env kontrol eder — Gmail OAuth/scopes/transport/migration/LIFE006/webhook YOK, eksikken `healthy:true` dönebilir | DOĞRULANDI |
| 13 | 44 legacy first_message | Canlı DB: 44 satır dolu `first_message`; ~40'ı eski riskli kalıplarda (önceki audit); UI'da normal metin gibi görünür (yalnız kopya butonu gate'li) | DOĞRULANDI (satır sayısı canlıdan) |

## Sonuç

Etiket: **pre-pilot ready** — dry-run altyapı kanıtlı, gerçek gelir zinciri
(1,2,3,4,5,6,7,8,10) kod eksiği + (9,11,13) veri/kalibrasyon eksiği ile bloklu.
Bu sprint Faz 1-8 bu bulguları kapatır; canlı migration/push/deploy/gerçek
provider YOK (pazarlıksız kurallar aynen).
