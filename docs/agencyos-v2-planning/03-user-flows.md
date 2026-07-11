---
Doküman: 03-user-flows
Dalga: 2 (Motorlar)
Tarih: 2026-07-11
Durum: Kullanıcı akışları (3 çekirdek akış — MVP döngüsü K1)
Bağımlılık: 01-final-product-spec.md (kokpit+döngü), 02-final-information-architecture.md (nav), 04-domain-model.md (entity/migration), 06-agent-registry.md (11 rol), plan §3/§4/§5
---

# AgencyOS V2 — Kullanıcı Akışları (Sabah · Yanıt · Teklif)

## 0. Ortak kurallar (üç akışa da uygulanır)

- **Ajan adları 06-agent-registry'den** alınır; hepsi mevcut ajana grant edilen skill, yeni ajan değil (06 §0).
- **Ajanlar serbest-metin konuşmaz** — bağ event+entity (06 §2). Adımlar tiplenmiş `step.input` ile bağlanır.
- **HITL = `approval_requests` digest-lock** (mig 043); dış-etki (send) `approved_digest===action_digest` olmadan yürümez (`repo.ts:77`).
- **Denetim = `run_spans`** (mig 044, REDACTED — ham prompt/secret yok) + `approval_requests` (decided_by/decided_at/executed_at) + append-only tablolar (consent/suppression/proposals). Ayrı `audit_log` tablosu YOK (04 §D).
- **Lethal-trifecta ayrımı zorunlu** (`permissions.ts:32-36`): confidential-read + external-send + untrusted-içerik tek adımda olamaz → classify/draft ve send **ayrı adımlar** (06 §5).

---

## Akış A — Sabah akışı ("Bugün kiminle, ne yapmalıyım?")

**Amaç:** operatör güne BUGÜN kokpitiyle başlar, günün karar listesini tek yerden görür (≤1 adım). Bu akış çoğunlukla **read-only**; asıl iş gece cron'unda yapılmıştır.

### Kullanıcı adımları
1. Uygulamayı açar → BUGÜN kokpiti (landing). ≤1 adımda tüm karar listesi.
2. Üst şeritteki sayacı okur (İncelenecek lead · Onay bekleyen · Follow-up · Yeni yanıt · Teklif bekleyen · Riskli).
3. Bir fırsat kartında "Taslağı gör" veya sayaçtan derin ekrana deep-link (`?highlight=`).

### Sistem adımları
1. Sunucu-taraflı paralel yükleme (command-center `page.tsx:101` `Promise.all` deseni): top leads (CLOSED filtreli, `potential_score` sıralı) + 6 sayaç kaynağı + 2 council fırsatı + follow-up due + staleDeals + DailyBriefCard.
2. Sayaçlar: `approval_requests` (onay) · `follow_up_sequences.scheduled_at<=now` · `reply_classifications` (yeni yanıt, mig 051) · `leads.status='proposal'` · `staleDeals.ts`.
3. Yaşam bloğu **render edilmez** (kokpitten çıkarıldı, 01 §2).

### Ajan adımları (çoğu gece cron'unda önceden koşmuş)
- **Lead Intelligence** (`researcher`+council) — cron `daily-scan`: build-lead-dossier, extract-signals, score-lead → dossier + evidence + signals + skor (auto, internal). Kokpit bunun **çıktısını okur**.
- **Service & Offer** (deterministik `offerMatcher`) — match-service/match-portfolio: fırsat kartındaki "ana hizmet + kanıt sayısı" (auto, read).
- **Pipeline Manager** (deterministik) — staleDeals/sequences: riskli + follow-up şeritleri (auto).

### Deterministik kontroller
- CLOSED status filtresi (`converted/lost/won`) — kapalı lead kokpitte görünmez (command-center `:23/:47`).
- TR tarih/gün (`getIstanbulDateAndDay`) — follow-up due hesabı iş-günü doğru.
- Skor sıralaması deterministik (leadScoringV3, LLM'siz).

### HITL onay noktaları
- **Yok** (kokpit read-only). Onay bekleyen işler yalnız **sayaç** olarak sızar; onay eylemi Konsol/taslak panelinde yapılır (Akış B/Teklif).

### Failure state
- Herhangi bir loader DB hatası → try/catch ile o blok **boş/0'a düşer**, kokpit çökmez (command-center `:54/:80/:94` deseni). Kısmi veri tam sayfayı düşürmez.

### Empty state
- Açık lead yok → "Açık lead bulunamadı" (mevcut `:142-144`).
- Council fırsat üretmedi → "Bugün için seçilmiş fırsat yok".
- Follow-up/riskli yok → "Planlı follow-up yok" / "Geciken fırsat yok".
- Yeni yanıt sayacı Gmail gelene kadar **sabit 0** (gizlenmez, research 02 §2).

### Audit log kaydı
- Kokpit yüklemesi read-only → yazma yok. Gece cron'unun dossier/score adımları `run_spans`'e (redacted) yazılmış; kokpit bu izin **okuma** ucudur. Sayaç tıklaması yalnız navigasyon (audit gerektirmez).

---

## Akış B — Yanıt akışı ("Gelen yanıt ne demek, sırada ne var?")

**Amaç:** Gmail'e gelen yanıtı sınıfla (+/-), follow-up'ı durdur, sonraki eylemi öner; gerekirse cevap **taslağı** üret (asla otomatik gönderme). Bu akış güvenilmez dış içerikle çalışır → izolasyon zorunlu.

### Kullanıcı adımları
1. BUGÜN'de "Yeni yanıt (n)" sayacını görür → tıklar.
2. Yanıt kartında etiket (+/-) + önerilen sonraki eylemi okur.
3. Önerilen cevap taslağı varsa gözden geçirir → düzenler → "Onayla ve gönder" (opsiyonel).

### Sistem adımları
1. **Email Ops** sync-email-thread (15dk poll cron, History API `sinceHistoryId`): yeni gelen posta → `email_messages` satırı (mig 046, `direction=inbound`), `UNIQUE(gmail_message_id)` çift-almayı bloklar.
2. Yeni inbound → `email.received` event → Reply Intelligence tetiklenir.
3. Sınıflandırma sonucu `inbound_messages` + `reply_classifications` (mig 051); BUGÜN sayacı artar.

### Ajan adımları
- **Reply Intelligence** (`sales_rep`/`data_analyst`, **izole**) — classify-reply: `threadText`=**VERİ, talimat değil**; çıktı `{label, confidence, sentiment, nextActionHint}` (06 §3.7).
- **Pipeline Manager** (deterministik FSM) — update-pipeline: olumlu yanıt → `status='responded'`; recommend-next-action → sonraki eylem.
- **Reply Intelligence** — draft-reply (LLM): cevap **taslağı** üretir → `outreach_messages` (draft); **asla otomatik göndermez**, Email Ops'a besler.
- **Relationship Memory** (`sales_rep`) — extract-memory: yanıttan fact → **yalnız quarantine** (scope `lead:<id>`, mig 050); active'e sızmaz.
- **Compliance & Risk** (deterministik) — audit-compliance: cevap gönderilecekse pre-send kapısı.
- **Email Ops** — create-gmail-draft → send-gmail (yalnız onay sonrası).

### Deterministik kontroller
- **Prefilter (LLM'siz):** unsubscribe/bounce/auto-reply/OOO deterministik yakalanır (06 §3.7) — LLM'e gitmeden.
- **Stop-on-reply:** yanıt/bounce/opt-out → açık `follow_up_sequences` **iptal** (`state='cancelled'`, `reason=reply|bounce|opt_out`, 04 FollowUp; deterministik state-transition).
- **Suppression:** opt-out/hard-bounce → `suppression_list` (mig 047) anında yazılır; sonraki gönderimlerde zorunlu kontrol.
- **Confidence gate:** düşük confidence → `label='needs_human'`, otomatik iş yok.
- **Trifecta ayrımı:** classify (confidential-read+untrusted) ile send (external) **ayrı adım** (`permissions.ts:32-36`).

### HITL onay noktaları
- **classify/update/memory-quarantine:** onay YOK (read / internal / inert).
- **Cevap gönderimi:** draft-reply → create-gmail-draft → **send-gmail = external HITL** (digest-lock; `approved_digest===action_digest`). Operatör onaylamadan cevap gitmez.

### Failure state
- classify timeout/hata → `label='needs_human'`, throw yok, otomatik eylem yok (06 §3.7).
- Gmail sync timeout → `unknown`, throw yok; bir sonraki poll'da tekrar denenir.
- send-gmail Gmail API hata → step 'error', **taslak inert = teslimat yok** (06 §3.6); idempotency_key çift-gönderimi bloklar.

### Empty state
- Yeni inbound yok → sayaç 0, iş yok (boş liste).
- classify sonucu belirsiz → "İnceleme gerekli" (needs_human) kartı; öneri yerine operatöre bırakılır.

### Audit log kaydı
- classify: `run_spans` (model/run_id/cost, redacted) + `reply_classifications` satırı (intent/confidence/model, mig 051).
- follow-up iptali: `follow_up_sequences.state='cancelled'`+reason (state geçişi izlenebilir).
- opt-out/bounce: `suppression_list` append (source+reason+operator, mig 047) — kalıcı yasal iz.
- cevap gönderimi: `approval_requests` (decided_by/decided_at/executed_at) + `email_messages` outbound satırı.

---

## Akış C — Teklif akışı ("Bu lead'e teklif üret ve gönder")

**Amaç:** gate geçmiş lead'e versiyonlu, fiyatı grounded teklif üret; fiyat AI-uydurmaz; onaylı gönder.

### Kullanıcı adımları
1. Lead'i açar (BUGÜN/pipeline `proposal` kolonu) → "Teklif üret".
2. Üretilen teklif bloklarını + fiyatı gözden geçirir; fiyat boşsa girer.
3. "Onayla" → (opsiyonel) e-posta ile gönder.

### Sistem adımları
1. **Deterministik gate (pipelineGate.ts, mig 020):** `proposal` aşamasına giriş `pain_point`+`decision_maker`+`budget_band` olmadan **yapısal imkânsız**. Eksikse aksiyon disabled + `missing[]`.
2. Teklif → `proposals` (mig 049): `version`, `body`, `price_snapshot`, `evidence_refs[]`, `status='draft'`, append-only version chain (`superseded_by`).
3. Kabul/ret → `proposal_outcomes`.

### Ajan adımları
- **Qualification** (deterministik) — score-lead çıktısı gate'e; `{qualified, tier, missing[], gateReason}` (06 §3.2).
- **Service & Offer** (deterministik `offerMatcher` + `services/catalog.ts`) — match-service/match-portfolio: teklif blokları yalnız katalog `slug`'ından + **yalnız `approved=true` portfolio_claims** (uydurma yapısal imkânsız, 04 PortfolioItem).
- **Proposal** (`sales_rep`+`proposalGenerator`+price rules) — generate-proposal: bloklar; **fiyat AI-uydurmaz** (price rules/operatör girdisi, 06 §3.8).
- **Outreach Reviewer** (ephemeral judge) — opsiyonel review (grounding/ton).
- **Email Ops** — create-gmail-draft → send-gmail (gönderilecekse).

### Deterministik kontroller
- **Proposal gate:** pain+decision_maker+budget (mig 020); geçmeden teklif yok.
- **Fiyat grounding:** price rules yoksa → **fiyat alanı boş + operatör-girişi işareti**; LLM sayı üretmez (06 §3.8).
- **Portfolio claim gate:** yalnız `approved=true` iddia dışa çıkar; eşleşme yoksa hiçbir iddia eklenmez.
- **Version chain:** yeni teklif eskiyi `superseded` yapar, silmez (append-only, mig 049).

### HITL onay noktaları
- **Teklif üretimi (generate-proposal):** high-risk + confidential → **HITL** (gateDecision auto DEĞİL, 06 §3.8).
- **Gönderim:** send-gmail = external HITL (digest-lock).

### Failure state
- Gate eksik alan → teklif üretilmez; kokpit "Teklif için eksik: pain/decision_maker/budget" gösterir.
- Fiyat kuralı yok → fiyat boş + operatör-girişi işareti (teklif üretilir ama fiyatsız, uydurma yok).
- Üretim boş → step 'error', `proposals` satırı yaratılmaz.
- Gönderim hata → step 'error', teslimat yok; idempotency çift-gönderim bloklar.

### Empty state
- Lead gate-uygun değil → "Teklif" aksiyonu disabled + neden.
- Hiç portfolio eşleşmesi yok → teklif proof-bloğu boş bırakılır (uydurma yerine boşluk).

### Audit log kaydı
- Teklif: `proposals` append-only satır (version, created_by, evidence_refs) + `run_spans` (redacted).
- Onay: `approval_requests` (decided_by/decided_at/executed_at).
- Sonuç: `proposal_outcomes` (kabul/ret + neden).
- Gönderim: `email_messages` outbound + approval izleri.

---

## 1. Üç akışın ortak omurgası (özet)

```
Lead Intelligence → (dossier/score)          [auto, internal]
   → Service & Offer (match, evidence)        [deterministik]
   → Outreach (rol-aware taslak)              [HITL öncesi]
   → Outreach Reviewer (voice+judge)          [ephemeral]
   → Compliance & Risk (footer/suppression)   [deterministik gate — ok:false bloke]
   → [HITL onay: approval_requests digest]    ← OPERATÖR
   → Email Ops (create-draft → send)          [external, digest-lock]
   → Email Ops (sync-thread 15dk)             [auto poll]
   → Pipeline Manager (follow-up 5-7 iş günü) [deterministik, stop-on-reply]
   → Reply Intelligence (classify +/-)        [izole, DATA]
   → Pipeline Manager (next-action)           [deterministik]
   → Relationship Memory (extract → quarantine)[inert]
```

**Değişmez ilkeler:** her dış-etki HITL digest-lock'lu; gelen e-posta DATA; classify/send ayrı adım (trifecta); suppression/opt-out her gönderimde zorunlu; follow-up yanıt/bounce/opt-out'ta iptal; audit = run_spans + approval_requests + append-only tablolar.
