---
Doküman: 12-gmail-and-followup-engine
Dalga: 2 (Motorlar — ⚑ K1 Gmail satış döngüsü çekirdeği)
Tarih: 2026-07-11
Durum: Motor tasarımı (Dalga 1 sözleşmelerine referansla)
Bağımlılık: 04-domain-model.md (EmailThread/EmailMessage/FollowUp/Suppression), 05-event-contracts.md (email.*/followup.*), 06-agent-registry.md (§3.6 Email Ops, §3.10 Pipeline Manager, §3.11 Compliance), 07-skill-registry.md (§2.10-2.13 gmail skills, §2.12 schedule-follow-up, §2.21 update-pipeline), 11-outreach-engine.md (aşama 9 girdisi), 13-reply-intelligence.md (stop-on-reply)
Kaynak: onaylı plan K1 (L2 onayla→gönder) + §3 rulings (scope send+readonly, poll MVP) + §5 (mig 046) · research 12-gmail-integration + 13-follow-up-engine + 10-email-deliverability · repo outreach/email.ts / sequences.ts / channelMatrix.ts / nextActionEngine.ts / staleDeals.ts / approvals/repo.ts
---

# AgencyOS V2 — Gmail & Follow-up Engine (L2 onayla→gönder + 5-7 iş günü takip)

## 0. Tek cümle + K1 kararı

Plan K1: e-posta döngüsü **MVP çekirdeği** — otomasyon seviyesi **L2** (ben onaylarım → sistem otomatik gönderir → takip eder → 5-7 iş günü içinde follow-up). Gmail OAuth = **Sprint-0 önkoşulu** (fabrike edilemez tek blokör; kullanıcı yetkilendirir). Ancak HITL onay kapısı + suppression + opt-out **pazarlıksız**. Research'ün "MVP Gmail'siz" görüşü K1 ile ezildi; ama L4 (tam otomatik) hâlâ **önerilmiyor** — mevcut lethal-trifecta guard ve tek-kişilik/marka-özdeş stüdyo itibar riski buna karşı (research 12 §3).

Bugün gerçek gönderim **yok**: `markMessageSent` yalnız `outreach_messages.status='sent'` yazar, teslimat operatörün elinde (`email.ts:4-40`). Reply/thread-sync yok, `status='replied'` alanı şemada var ama **hiçbir kod yolu yazmıyor** (research 13 §1). Bu doküman iki motoru tanımlar: (A) Gmail gönderim/senkron, (B) follow-up state machine. Kod yazmaz.

---

# A. Gmail entegrasyonu (L2)

## A.1 Scope (least-privilege, plan §3 ruling)

| Scope | Kullanım | Karar |
|-------|----------|-------|
| `gmail.send` | onaylı taslağı gönder (`messages.send`) | **MVP — evet** (K1 L2 gönderim) |
| `gmail.readonly` | thread bağlamı + reply/bounce tespiti | **MVP — evet** (follow-up + reply intelligence girdisi) |
| `gmail.compose` | operatörün Gmail Taslaklar klasörüne taslak yaz | **V1 opsiyonel** (create-gmail-draft; MVP değil) |
| `gmail.modify` | etiket/oku-yaz | **YASAK** (plan §3; `compose`+`readonly` daha dar) |
| `https://mail.google.com/` | tam erişim + kalıcı silme | **ASLA** (hiçbir senaryoda gerekmiyor) |

- **Kanonik MVP kombinasyonu:** `gmail.send` + `gmail.readonly`. MVP L2 akışında taslak **uygulama-içi** (`outreach_messages`, gövde AgencyOS'ta) tutulur → HITL onay → `messages.send`. Gmail'in kendi "Taslaklar" klasörüne yazmak (create-gmail-draft) `gmail.compose` gerektirir ve **V1**'e ertelenir; MVP `send` ile tamdır.
- **`assumption:` (research 12 §2/§10):** `users.watch` için gereken minimum scope resmi per-method tablosuyla implementasyon öncesi teyit edilmeli — MVP poll olduğu için watch MVP'de yok, bu risk V2'ye kalır.
- **Fail-closed (research 12 §7):** refresh başarısız (`invalid_grant`) → gönderim/taslak akışı **durur**, HITL bypass edilmez; asla gizli SMTP fallback açılmaz. Tek operatör → tek admin uyarı ("Gmail bağlantısı kesildi, yeniden bağlan").

## A.2 L2 gönderim akışı (draft → approve → send)

```
Outreach (11) → outreach_messages(draft) → HITL approval_requests(mig 043)
  → operatör "Onayla ve Gönder" → send-gmail(gmail.send)
  → email_messages(outbound, mig 046) → follow-up scheduler ilk step
```

Her adımın sözleşmesi (06 §3.6 Email Ops):

| Adım | Trigger | Guard | Yan-etki | HITL | Audit |
|------|---------|-------|----------|------|-------|
| draft hazır | outreach.approved event | — | — | zaten onaylı | `run_spans` |
| compliance gate | pre-send zorunlu | footer + suppression + SPF/DKIM/DMARC | — | hayır (ok:false → **bloke**) | `run_spans` |
| send-gmail | onaylı `approval_request` | `approved_digest === action_digest` + not-expired + not-executed (`repo.ts:63-97`) | Gmail `messages.send` | **EVET (external, K1 L2)** | `email.sent` durable |
| kayıt | send başarılı | — | `outreach_messages.status='sent'` + `gmail_message_id`/`gmail_thread_id` (mig 046) | — | audit |

- **Compliance kapısı (06 §3.11):** `audit-compliance` (footer var mı + adres-sınıfı + suppression'da mı) + `audit-deliverability` (SPF/DKIM/DMARC + one-click-unsub) → `ok:false` **gönderimi bloke eder** (deterministik, LLM'siz; regex footer + DNS TXT). KVKK/İYS **teknik** kapı, hukuki görüş değil (research 12 §10, hukuk incelemesi ayrı flag).
- **Suppression zorunlu (research 10 §11, mig 047):** her `send-gmail` öncesi `suppression_list` kontrolü geçmeli; suppress'te → send yürümez. Bu, "en somut, en düşük riskli, en yüksek öncelikli bulgu" (research 10 §11).

## A.3 Idempotency (çift-gönderim yapısal imkânsız)

Gmail API'nin yerleşik idempotency-key'i **yok** (research 12 §5) — tekilleştirme AgencyOS sorumluluğu. Mevcut kanıtlı desenler yeniden kullanılır:

1. **DB-seviyesi tek-geçiş:** `markMessageSent` idempotent deseni (`email.ts:22-24`: zaten `sent` → no-op) genişletilir; gönderim öncesi `WHERE status='approved'` update ile atomik tek-seferlik geçiş (race guard).
2. **Approval idempotency:** `approval_requests` UNIQUE `idempotency_key` (mig 043, `repo.ts:21-47` upsert `onConflict` ignoreDuplicates) — aynı istek 2 kez onaylanamaz; `markApprovalExecuted` (`repo.ts:86-97`) `approved→executed` tek geçiş.
3. **Gmail ID kaydı:** dönen `id`/`threadId` `outreach_messages`'a yazılır (mig 046) — mevcut olmayan alanlar; sonraki thread eşlemesi ve dedup buna dayanır.

Sonuç: aynı taslak iki kez gönderilemez (approval executed + status sent + gmail_message_id UNIQUE üçlü guard).

## A.4 Thread haritası (mig 046)

`email_threads` + `email_messages` (04 §B) Gmail ile eşleşme ankrajı:
- **`email_threads`:** `gmail_thread_id` (UNIQUE), `contact_id`, `lead_id`, `last_history_id` (artımlı sync), `last_synced_at`.
- **`email_messages`:** `gmail_message_id` (UNIQUE), `direction` (inbound/outbound), `message_id_header`, `in_reply_to`, `references` — RFC 2822 thread-bağı (yalın "Re:" thread'e bağlamaz; `In-Reply-To`/`References` header'ları + `threadId` şart, research 12 §1).
- **`outreach_messages` ↔ `email_messages`:** taslak (outreach_messages) gönderildiğinde bir outbound `email_messages` satırı doğar; ikisi ayrı defter (04 MessageDraft vs EmailMessage — taslak-defteri ≠ gerçek-posta).

## A.5 Senkron (History API poll, plan §3 MVP)

- **Poll (MVP/V1):** yeni cron (`gmail-sync`, mevcut `daily-scan` `CRON_SECRET` bearer deseni), **15dk** aralık, `users.history.list(startHistoryId)` (2 kota birimi, ucuz, research 12 §6). Yeni mesajları `threadId` ile eşler → `email_messages` upsert (`gmail_message_id` UNIQUE).
- **HistoryId kayması:** history kayıtları "en az 1 hafta" garantili; süre dolarsa 404 → full-list fallback (research 12 §1). `last_history_id` geriye kayarsa full re-sync.
- **Bounce dalı:** ayrı endpoint yok (research 12 §4) — aynı poll'de `mailer-daemon@`/`postmaster` göndereni veya `Content-Type: multipart/report; report-type=delivery-status` + DSN `Action=failed`/`Status=5.x.x` header'ı taranır → `email.bounced` (05). Hard bounce → `suppression_list` anında upsert (`source='bounce'`) + tüm pending follow-up iptal.
- **Push (V2):** `users.watch` + Pub/Sub (near-real-time) yalnız poll gecikmesi gerçek sorun olursa; ayrı GCP topic/subscription/public-HTTPS + 7-günde-bir watch-yenileme cron'u gerektirir → tek-operatör/düşük-hacimde MVP için gerekçelendirilemiyor (research 12 §4).

## A.6 OAuth + refresh token güvenliği (Sprint-0)

- **Sprint-0 önkoşulu:** OAuth consent akışı (tek operatör, tek Gmail hesabı) fabrike edilemez — kullanıcı yetkilendirir. Bu doküman mimariyi tanımlar, akışı başlatmaz.
- **Env:** `GOOGLE_OAUTH_CLIENT_ID`/`_SECRET`/`_REDIRECT_URI` (isim; değer değil — secrets kuralı). Bağımlılık: `googleapis` (Google resmi Node istemcisi; standard-lib/mevcut çözümle karşılanamıyor → gerekçeli ekleme, research 12 §8).
- **Refresh token saklama (research 12 §8/§10 mimari karar):** refresh token bir env DEĞİL — tek operatörün kişisel OAuth grant'i, build-time secret değil. **DB'de saklanır + Vault/uygulama-katmanı şifreleme ile** (repoda Apollo/Firecrawl statik-key emsali var ama OAuth grant emsali yok → net-new). Trace/log'a **asla** ham token yazılmaz (`redactAttributes`, mig 044). `assumption:` şifreleme mekanizması Sprint-0'da netleşir (Vault/pgcrypto).

## A.7 Kota (pratik darboğaz değil)

Standart Gmail 500 e-posta/24s, Workspace 2.000; `messages.send`=100 birim, `history.list`=2 birim (research 12 §6). Ali Cem'in hacmi (günde tek-haneli outreach) bunların binde biri — teknik kota sorun değil; asıl kısıt **deliverability disiplini** (SPF/DKIM/DMARC, düşük şikâyet, research 10). 429/kota → truncated exponential backoff.

---

# B. Follow-up state machine (5-7 iş günü)

## B.1 Problem: üç dağınık kural seti (konsolidasyon işi)

Bugün follow-up mantığı **üç ayrı, birbirinden habersiz** kural setinde (research 13 §1, doğrulandı):

| Kaynak | Eşikler | Sınırlama |
|--------|---------|-----------|
| `follow_up_sequences` (`sequences.ts` + `channelMatrix.ts`) | gün 1/2/4/7/10/14 sabit | takvim günü; lead durumu/yanıttan bağımsız; hafta sonu/tatil bilmiyor |
| `nextActionEngine.ts` STAGE_SLA_DAYS (`:25-31`) | new:3, contacted:4, responded:3, meeting:5, proposal:5 | ayrı eşik; DB'ye yazmaz, UI-hesap |
| `staleDeals.ts` RULES (`:24-31`) | contacted:3, responded:2, meeting:7, proposal:4, nurture:14 | üçüncü, **tutarsız** eşik (ör. contacted 4 vs 3) |

Üçü de takvim günü sayıyor, iş-günü/tatil bilmiyor, hiçbiri yanıt/bounce/opt-out'ta diğerini durdurmuyor. Bu **"sıfırdan değil, konsolide"** işi — `follow_up_sequences` şeması + `processDueSequences` promotion akışı **korunur**; nextActionEngine ve staleDeals eşikleri tek kaynağa devredilir.

## B.2 Konsolide durum makinesi

| Durum | Trigger | Guard | Yan-etki | HITL | İptal |
|-------|---------|-------|----------|------|-------|
| `draft` | outreach üretildi (11) | — | `outreach_messages.status='draft'` | — | — |
| `approved` | operatör onayı | approval digest-lock | `status='approved'` | evet | — |
| `sent` | send-gmail başarılı | idempotency (A.3) | `status='sent'` + gmail_id; **ilk follow-up planla** | — | — |
| `waiting` | gönderim sonrası pencere | — | `follow_up_sequences` due_at (iş-günü hesaplı) | — | — |
| `followup.due` | iş-günü `due_at ≤ now` & `done=false` | **lead-status guard** (B.4) | `agent_tasks` (hatırlatma/taslak) | — | reply/bounce/opt-out |
| `followup.drafted` | due promote | farklı-açı (tekrar önleme) | yeni taslak (11) → tekrar `draft` | evet (gönderim) | — |
| `nurture` | max deneme / proposal 14g aşımı | — | düşük-öncelik | — | — |
| `closed` | converted/lost/archived | — | `leads.status` | operatör | tüm pending iptal |

- **Her geçiş:** trigger + guard + yan-etki + HITL + audit-log (`run_spans`/`follow_up_sequences.state`) + iptal-koşulu. State-transition **LLM'siz** (dedup/tarih/FSM, 07 §2.12/§2.21).
- **Additive alanlar (04 FollowUp):** `follow_up_sequences` mevcut (`lead_id`/`step`/`channel`/`due_at`/`done`) + NEW `state` (pending/sent/cancelled/replied) + `reason` (reply/bounce/opt_out/manual). `follow_up_rules` DB tablosu ertelendi (plan §3).

## B.3 İş-günü kadansı (yeni businessDays.ts + trHolidays2026.ts)

Repoda iş-günü hesaplayan fonksiyon yok (research 13 §3; `getIstanbulDateAndDay` yalnız saat-dilimi çeviriyor):
- **Yeni `src/lib/businessDays.ts`** (saf fonksiyon, `Europe/Istanbul`, `Intl.DateTimeFormat` deseni): `addBusinessDays(from, n)` — hafta sonu (Cmt/Paz) + tatil listesi atlar. Hafta sonuna denk gelen `due_at` → **sonraki Pazartesiye** öteler (öne çekmez; erken gönderim riskli).
- **Yeni `src/data/trHolidays2026.ts`** (12-satırlık sabit dizi, `orchestratorConfig.ts` deseni): yılbaşı, Ramazan/Kurban bayramı, ulusal bayramlar (research 13 §3 tablosu). `assumption:` dini bayram tarihleri Diyanet resmi ilanına kadar kesin değil (yıl-başı tek-satır teyit); arefe (yarım gün) MVP'de tam-tatil sayılır (basitlik).
- **Cron uyumu:** iş-günü mantığı **cron'da değil, `due_at` hesaplamasında** (scheduling anında). `agent-tick` günde bir (öğlen İstanbul) hafta sonu dahil çalışır; `processDueSequences` yalnız "şimdi mi geçti" bakar — `due_at` zaten iş-günü düzeltmesinden geçmiş (research 13 §3).

**Segment kadansı (research 13 §4, `CustomerType` ile hizalı — `[LIKELY]`, gerçek veriyle kalibre edilmeli):**

| Segment | 1. takip | 2. takip | Nurture eşiği |
|---------|----------|----------|---------------|
| `local` | 3 iş günü | 5 iş günü | 3 takip sonrası |
| `ecommerce` | 3 iş günü | 6 iş günü | 3 takip sonrası |
| `agency_b2b` | 4 iş günü | 7 iş günü | 4 takip sonrası |
| `founder` | 3 iş günü | 5 iş günü | 3 takip sonrası |

Max 2 otomatik takip + 1 close-loop = 3 dokunuş (mevcut `channelMatrix.ts` gün-14 `close_loop` ile örtüşür; yalnız iş-günü olarak yeniden hesaplanır).

## B.4 Durdurma koşulları (reply/bounce/unsubscribe/meeting → TÜM pending iptal)

Salesloft/Outreach.io olgun durdurma mimarisi AgencyOS HITL felsefesiyle örtüşür (research 13 §5):

| Sinyal | Aksiyon | Kaynak event |
|--------|---------|--------------|
| Yanıt geldi | sekans durdur, `leads.status='responded'`, tüm pending `followup.cancelled(reason=reply)` | `email.replied` → 13-reply-intelligence |
| Hard bounce | kalıcı durdur, suppress, lead "geçersiz e-posta" | `email.bounced` (A.5) |
| Unsubscribe/"ret" | sekans durdur + suppression + İYS/KVKK kaydı | reply.classified `intent=opt_out` (13) |
| Meeting/proposal'a geçti | sekans durdur (pipeline ilerledi) | `opportunity.created` |
| Manuel operatör | sekans durdur | UI "durdur" butonu (`done=true`) |
| Max takip aşıldı | nurture'a taşı | staleDeals `move_to_nurture` |

**Kritik guard (research 13 §5):** `processDueSequences` (`sequences.ts:50-86`) bugün `lead_id`'ye bakmadan yalnız `due_at`/`done` ile promote ediyor — konsolide makine, promotion **öncesi `leads.status` kontrolü** ekler: status zaten `responded`/`converted`/`lost`/`archived` ise satırı sessizce `done=true` yapıp atla (yanıtlanmış lead'e tekrar takip kuyruklamaz). Bu, mevcut fonksiyona **tek ek sorgu**, yeni tablo gerektirmez.

- **Idempotency (durdurma):** iptal `lead_id + step + reason` doğal-anahtar (05 §followup.cancelled); aynı iptal iki kez → tek etki.
- **`status='replied'` yazıcı:** bugün ölü (research 13 §1) — reply-intelligence (13) canlıya alınınca `email.replied` bu alanı ve durdurmayı tetikler. Bağımlılık: bu motor sinyali tüketir, sinyali 13 üretir.

## B.5 Farklı-açı kuralı (tekrar önleme)

Follow-up mevcut 4 açıyı (`coldEmailTemplates.ts`) rotasyonla kullanır (research 13 §6): 1. takip ilk açıyı tekrar etmez (mini_audit→before_after); CTA her takipte daha düşük-baskılı ("10 dk konuşalım" → "faydalı olur mu bilemedim" → "ihtiyaç olursa yazarsınız"). Takip-klişeleri ("sadece hatırlatmak istedim", "yukarıdaki maile binaen") yasak-listeye eklenir. Bu, Outreach motorunun (11 §4 `followUpAngle` çıktısı) girdisidir.

## B.6 Konsolidasyon dosya haritası (research 13 §7)

- `channelMatrix.ts`: sabit `day` → `addBusinessDays` (yeni `businessDays.ts`); segment gün-sayıları `CustomerType`'a parametrize.
- `nextActionEngine.ts`: `STAGE_SLA_DAYS` kaldır → `follow_up_sequences`/`leads.next_follow_up_at` **tek kaynak**.
- `staleDeals.ts`: `RULES` merkezi segment tablosuna devret (saf-fonksiyon imzası korunur, girdi kaynağı değişir).
- `sequences.ts`: `processDueSequences`'a lead-status guard (B.4); `scheduleFollowUp` iş-günü bazlı.
- `agent-tick/route.ts`: **değişmez** (mantık scheduling katmanında).
- **Dokunulmaz:** `active_tasks`/`habits`, `/gorevler`/`/aliskanliklar`, LIFE DB — bu motorun hiçbiri temas etmez.

## B.7 Metrik (mevcut, doğru — değişmez)

`outreach/metrics.ts` open-rate'i **kasıtlı dışlıyor** (Apple MPP + bot, research 10 §7); KPI = `positiveReplyRate` + `bounceRate`. Bu mimari doğru (research 10 doğruladı), değişmez — yalnız `status='replied'`/`failed` yazıcı (Gmail sync) canlıya gelince gerçek veri akar.

## C. Hata & durum davranışı

| Durum | Davranış |
|-------|----------|
| Gmail API hata | step `error`, `markMessageSent` çağrılmaz → teslimat yok |
| Onay uyuşmazlığı | `canExecuteApproval` false → send yürümez |
| Sync timeout | `unknown`, throw yok; historyId kayması → full-list fallback |
| Mevcut (lead,step) | no-op (`unique(lead_id, step)` guard) |
| Refresh token invalid | fail-closed: akış durur, HITL bypass yok, SMTP fallback YOK |
| Suppress'te adres | send bloke |
| Compliance ok:false | send bloke (footer/SPF/DKIM/DMARC eksik) |

## D. MVP / V1 / V2

- **MVP (K1 L2):** OAuth (Sprint-0) + `gmail.send`+`readonly` + uygulama-içi taslak → HITL onay → `messages.send` + idempotency + suppression/compliance gate. `businessDays.ts`+`trHolidays2026.ts` + `processDueSequences` lead-status guard. History poll (15dk) reply/bounce tespiti. `update-pipeline` FSM.
- **V1:** `gmail.compose` ile Gmail-Taslaklar (create-gmail-draft); bounce hard/soft ayrımı; nextActionEngine/staleDeals eşik konsolidasyonu; `leads.status='nurture'` (CHECK yok → migrationsız); UI "durdur" butonu; Google Postmaster Tools (DNS TXT).
- **V2:** Push (Pub/Sub) yalnız poll gecikmesi sorun olursa; L3 önceden-onaylı follow-up (TTL + günlük cap, dikkatli); segment gün-sayılarını `lead_match_feedback` ile öğrenen kalibrasyon; RFC 8058 one-click-unsub (yalnız hacim/otomasyon artarsa).

## Grounding & açık noktalar

- **Repo atıfları:** `outreach/email.ts:4-40` (markMessageSent kayıt-only, idempotent), `sequences.ts:30-86` (scheduleFollowUp/processDueSequences — lead_id guard yok), `channelMatrix.ts` (gün 1/2/4/7/10/14, CustomerType), `nextActionEngine.ts:25-31` (STAGE_SLA), `staleDeals.ts:24-31` (RULES + nurture 14g), `outreach/metrics.ts` (open-rate dışlı), `approvals/repo.ts:21-97` (idempotent upsert + digest-lock + executed).
- **Migration:** 046 (email_threads/email_messages + outreach_messages gmail_* additive), 047 (suppression + leads do_not_contact), 043 (approvals mevcut).
- **`assumption:`** watch scope teyidi (implementasyon önce); refresh-token şifreleme mekanizması (Sprint-0); 2026 dini bayram tarihleri (Diyanet teyidi); segment gün-sayıları gerçek veriyle kalibre.
- **`unverified:`** `draft_proposal`/`draft_email`'in bugün 500 mü döndüğü (16 doğrulaması — model ID'leri ölü); canlı API-key testi bu görevde yapılmadı.
- **Cross-refs:** 11-outreach-engine.md (aşama 9 girdisi), 13-reply-intelligence.md (email.replied → durdurma), 16 (preset — Email Ops LLM'siz), 07 §2.11/§2.12/§2.21, 06 §3.6/§3.10/§3.11.
