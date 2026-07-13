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
