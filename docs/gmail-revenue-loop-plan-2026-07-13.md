# Gmail / Reply / Gerçek Gelir Döngüsü — Kod + Güvenlik Planı (Sprint-3 Faz 7)

**DURUM: PLAN — hiçbir gerçek provider işlemi yapılmadı; GMAIL_SEND_ENABLED=false;
gerçek send ayrı güvenlik incelemesi + açık kullanıcı onayı ister (pazarlıksız sınır).**

## 1. Google OAuth + Vault (plaintext refresh token YOK)

- Akış: `/api/gmail/oauth/start` → Google consent → `/api/gmail/oauth/callback`.
- Callback refresh token'ı YALNIZ Supabase Vault'a yazar
  (`vault.create_secret`), `gmail_accounts.vault_secret_id` yalnız referans
  taşır (mevcut şema buna hazır: `vault_secret_id` kolonu). Token asla
  loglanmaz, asla tabloya/plaintext'e yazılmaz.
- State parametresi: HMAC-imzalı + 10 dk TTL (CSRF).
- Mevcut kod dayanağı: `sendMachine`/`gmail.ts` transport soyutlaması hazır;
  OAuth'suz REST çağrısı bugün açık hatayla düşüyor (testli).

## 2. Minimum scope + bağımsız güvenlik incelemesi

- Scope: `gmail.send` + (reply ingest için) `gmail.readonly` — DAHA FAZLASI YOK
  (gmailScopes.ts'te sabitlenir; test mevcut).
- Bağımsız inceleme kontrol listesi: token akışı, Vault erişim politikası,
  webhook/cron yüzeyleri, redaction, KVKK/İYS metinleri. İnceleme kapanmadan
  `GMAIL_SEND_ENABLED=true` YAPILMAZ.

## 3. Gönderici itibarı / DNS kontrol listesi (dış konfig — kullanıcı aksiyonu)

- SPF: `include:_spf.google.com`; DKIM: Workspace'ten domain key; DMARC:
  `p=quarantine; rua=…` ile başla.
- Isınma: gün 1-7 ≤10/gün, tek domain'e ≤2; bounce>%3 → otomatik durdur
  (metrics tablosuna sayaç + kill-switch).

## 4. Inbound reply ingest + thread eşleştirme + sınıflandırma

- Cron `history.list` (readonly) → yeni inbound mesajlar → `email_messages`
  (direction='inbound') + thread eşleşmesi `gmail_thread_id` üzerinden
  (şema hazır: email_threads/email_messages canlı).
- Sınıflandırma: önce deterministik (unsubscribe/‘ret’ kalıpları → suppression;
  soru işareti/uzunluk → human-review), sonra LLM etiketi (positive/negative/
  objection) — LLM YALNIZ etiket önerir, aksiyon operatörde.

## 5. FSM: positive / negative / objection / unsubscribe / human-review

- Durumlar lead bazında: `awaiting_reply → replied_{positive|negative|objection}
  | unsubscribed | human_review`.
- 'ret'/unsubscribe → suppression_list'e yazım (mevcut fail-closed kapılar bunu
  anında uygular) + follow_up_sequences iptali (Faz 2'deki cancelOpenSteps
  mekanizması aynen kullanılır — kod HAZIR).
- Reply alınan lead: processDueSequences zaten inbound-reply görünce sequence'i
  DURDURUYOR (Sprint-3 Faz 2'de kodlandı + test edildi).

## 6. Pilot kuralları

- İlk pilotta HER outbound mesaj AYRI HITL onayı (mevcut approval akışı).
- FOLLOWUP_FSM_ENABLED=false kalır; açılması ayrı onay.
- KVKK/İYS: compliance footer + MERSİS zorunlu (mevcut buildComplianceFooter);
  İYS kaydı ve aydınlatma metni bağımsız inceleme kapsamında.

## 7. Ölçüm zinciri (bunsuz "revenue-ready" DENMEZ)

`lead → sent(email_messages) → reply(inbound) → meeting(lead_action_audit) →
proposal(proposals/versions) → won(projects + convert audit)`
- Tüm halkalar şemada mevcut/hazır; eksik tek şey GERÇEK provider trafiği.
- Dashboard: opsMetrics (Faz 4.9) + proposal_events + convert audit'ten türetilir.

## Sıralı yapılacaklar (onaylar geldikçe)

1. Kullanıcı: Google Cloud OAuth client + Vault onayı → kod: oauth route'ları.
2. Kullanıcı: DNS kayıtları → doğrulama scripti (checkdns).
3. Bağımsız güvenlik incelemesi → bulgular kapanır.
4. Kullanıcı açık onayı → GMAIL_SEND_ENABLED=true (pilot, günlük limitli).
5. Reply ingest cron aktif → FSM gölgede 1 hafta → FOLLOWUP_FSM ayrı onayla.

---

## FINALIZATION Faz 7 GÜNCELLEMESİ (2026-07-14) — plan → ÇALIŞAN KOD

Aşağıdakiler artık plan değil, KOD (provider sınırına kadar; gerçek Google
çağrısı yalnız kullanıcı consent/config sonrası yaşanır):

| Bileşen | Dosya | Durum |
|---|---|---|
| OAuth start (state HMAC+TTL, PKCE S256, min. scope) | src/app/api/gmail/oauth/start | kod + unit |
| OAuth callback (state+PKCE doğrulama, scope allowlist FAIL-CLOSED, vault'a yazım) | src/app/api/gmail/oauth/callback | kod + unit |
| Token Vault (Supabase Vault; düz metin tablo/log YOK; rotation + revoke) | src/lib/gmail/tokenVault.ts + mig 064 | kod + unit + DB roundtrip kanıtı (test DB) |
| Gmail send transport | src/lib/outreach/gmail.ts (mevcut) + access token tokenVault'tan | kod |
| Inbound ingest (güvenli polling; watch/history pilot maddesi) | src/lib/gmail/replyIngest.ts | kod + unit + fake-provider E2E |
| Reply classification FSM (opt-out/auto-reply/objection/not-now/positive) | src/lib/gmail/replyFsm.ts | kod + unit |
| Cevapta follow-up İPTALİ | ingest → stopSequencesForLead | kod + unit + E2E |
| Opt-out → suppression + do_not_contact + sonraki onay isteği 422 | ingest + auditCompliance | kod + E2E |
| Thread attribution (In-Reply-To/References ↔ rfc_message_id) | replyIngest | kod + unit + E2E |
| Reconcile görünürlüğü | /reconcile (Telegram) + kokpit sorunlar paneli | kod (Faz 5) |
| Shadow mode | GMAIL_INGEST_ENABLED default kapalı | kod + E2E guard |

### KULLANICI AKSİYONLARI (kod bunlarsız gerçek provider'a ÇIKAMAZ — dürüst liste)
1. Google Cloud OAuth client (web) + redirect URI; Vercel env:
   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GMAIL_OAUTH_REDIRECT_URI.
2. /api/gmail/oauth/start akışını tarayıcıdan tamamla (consent).
3. DNS: SPF + DKIM + DMARC kayıtları (deliverability ön şartı).
4. KVKK/İYS: ticari ileti envanteri + ret kanalı beyanı (metinler hazır;
   hukuki teyit kullanıcıda).
5. Bağımsız güvenlik incelemesi (OAuth/vault/ingest yüzeyi) — pilot ÖN ŞARTI.
6. Ayrı açık onaylar: GMAIL_INGEST_ENABLED=true (ingest) ve
   GMAIL_SEND_ENABLED=true (gönderim; mesaj-başı HITL korunur).

### Bilinen sınırlar (gizlenmedi)
- id_token e-postası JWKS ile ayrıca doğrulanmıyor (TLS+code-exchange kanalı;
  pilot güvenlik incelemesi maddesi).
- Ingest polling'tir (3 gün penceresi, 25 mesaj/sayfa); watch/history pilotta.
- 'GERÇEK provider ile kanıtlı' etiketi HÂLÂ YOK — tüm E2E fake transport.
