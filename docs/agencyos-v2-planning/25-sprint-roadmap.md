---
Doküman: 25-sprint-roadmap
Dalga: 2 (Motor — sprint planı; 23/24'e referans)
Tarih: 2026-07-11
Durum: ≤2-haftalık sprint planı (23-mvp-v1-v2.md faz + 24-parallel-workstreams.md WS ile senkron)
Bağımlılık: plan §5 (migration), 06 §4 (aktivasyon kapıları), 16 §5 (routing refactor), 21 (güvenlik kapıları), 26-acceptance-tests.md (acceptance)
---

# AgencyOS V2 — Sprint Roadmap (≤2 hafta/sprint)

## 0. İlke

Her sprint **kullanıcıya görünür bir sonuç** üretir; ≤2 hafta; migration'lar plan §5 kanonik (canlı `list_migrations` doğrulanır); her sprint acceptance + rollback + demo taşır. Sprint 0 sözleşme+önkoşul; Sprint 1'den itibaren döngü kapanır. **Gmail OAuth Sprint-0 önkoşulu** (fabrike edilemez); gecikirse Sprint 1 Gmail-adımları shadow'da, cockpit+deterministik ilerler.

**Değişmez:** HITL pazarlıksız · premium asla-default · deterministik işe LLM yok · LIFE DB dokunulmaz · yeni onay/kuyruk KURULMAZ.

---

## Sprint 0 — Sözleşme + önkoşul + acil fix

- **Kullanıcı sonucu:** (görünmez altyapı) Sistem canlı modele düşmeyi bırakır (3 ölü ID fix); tüm motorlar donmuş sözleşmeye kodlanabilir; Gmail yetkisi hazır.
- **Scope:** (1) **Model-routing URGENT fix** — `OPERATION_MODEL_MAP`→`PRESETS` (16 §5), `models:[primary,...fallbacks]` self-heal, AbortController timeout, 1 retry, görünür fallback log, ceiling. 3 ölü ID (`gemini-2.5-flash-lite`,`claude-haiku-4-5`,`deepseek-v4-pro`) canlı preset'e. (2) **Gmail OAuth prereq** — operatör Google Cloud OAuth istemcisi/connector; `gmail.send`+`gmail.readonly` scope; token şifreli-ayrı-tablo (RLS+REVOKE). (3) **Feature flags** — `BRAIN_V2_ENABLED`/`BRAIN_ACTIVE_ENABLED` + skill `active` (mig 041) doğrula. (4) **Audit log** — `run_spans`+`approval_requests` yeterli (dedicated tablo YOK); redaksiyon token-prefix ekle.
- **Out-of-scope:** gerçek gönderim, reply ingest, cockpit UI, yeni motor.
- **Tasks:** preset registry + router policy; nightly model-verify cron; OAuth flow + token tablosu; contract-gate dondur (04/05/06/07/16); relationship view + message/thread additive tasarımı.
- **Dependencies:** WS G + H; contract-gate.
- **Migrations:** 046 (outreach_messages additive başlangıç: thread/message id alanları) + 052 (tool_cost_logs + preset config) + token tablosu; **hepsi H, canlı `list_migrations` doğrula**.
- **Acceptance:** `callWithOperation` imzası değişmedi; ham model ID hiçbir yerde; primary 404→otomatik fallback (test); OAuth token şifreli+RLS; feature flag OFF default.
- **Tests:** preset-registry unit, fallback-self-heal, token-redaction (T4/T11), imza-parity (çağıran kırılmaz).
- **Rollback:** router refactor tek dosya (`openrouter.ts`) — revert; OAuth token tablosu additive drop; flag OFF.
- **Demo:** ölü-ID operasyonu (ör. `draft_proposal`) artık canlı modele düşüyor; fallback log görünür.

---

## Sprint 1 — Günlük satış workflow (Bugün + dossier + draft + Gmail send)

- **Kullanıcı sonucu:** Sabah `/bugun`'u aç → lead dossier + rol-aware önerilen hizmet/kanıt → rol-aware taslak (Voice Guard geçmiş) → **onayla → Gmail'den gönder** → gönderildi işaretlenir. Döngünün ilk yarısı canlı.
- **Scope:** WS A (Bugün cockpit recompose) + WS E (Gmail draft/send HITL) + ★MVP skiller: `build-lead-dossier`, `score-lead`(wired), `match-service`(wired), `generate-outreach`, `review-outreach`, `send-gmail`, `update-pipeline`. Suppression pre-send gate + `audit-compliance`.
- **Out-of-scope:** reply ingest, follow-up otomasyonu, teklif, memory-öğrenme, öğrenen Voice DNA.
- **Tasks:** `/bugun` route (4 ekran birleş, `/icraat-firsatlari` HIDE, `/dashboard`+`/tasks` DELETE); `outreach/gmail.ts` send (tek fonksiyon, `permissionClass:'external'`); HITL approval ekranı (alıcı domain görünür — T10); suppression check; deterministik skilleri active (Qualification/Service/Compliance önce, 06 §4).
- **Dependencies:** Sprint 0 (routing+OAuth+contracts); WS A∥E.
- **Migrations:** 045 (contacts+rol — rol-aware için), 047 (suppression_list+consent_records), 046 tamamla (original_body/final_body/gmail_*). **H, doğrula.**
- **Acceptance (26 Senaryo 1+2):** yeni lead→domain-verify→evidence→need-signals→score→service→dossier (kanıt görünür); outreach→yalnız-doğrulanmış-kanıt→draft→sahte-övgü YOK→tek-ana-hizmet→Voice Guard→edit→Gmail draft→çift-draft YOK; send→approval digest-lock→suppression honor→çift-gönderim YOK.
- **Tests:** `eval.lead.build_dossier`, `eval.sales.draft_cold_email`, `eval.outreach.send_gmail`; Playwright cockpit her-durum; T5/T6/T8.
- **Rollback:** send skill `active=false` (flag) → taslak-yalnız moduna dön; cockpit route feature-flag'li.
- **Demo:** bir lead için dossier→taslak→onayla→gönder canlı; audit izi + suppression bloke örneği.

---

## Sprint 2 — Follow-up state machine + reply classification + pipeline update

- **Kullanıcı sonucu:** Gönderdiğin mail takip edilir; dönmeyen leade 5-7 iş günü sonra follow-up görevi (onayla→gönder); gelen yanıt otomatik sınıflandırılır (+/-/itiraz/soru) ve pipeline durumu önerilir; yanıt gelince sonraki follow-up iptal.
- **Scope:** WS E (reply-read/sync + follow-up state machine tamamı) + ★`schedule-follow-up`, ★`classify-reply`, `sync-email-thread`, `recommend-next-action`. Reply Intelligence injection-izole (T2).
- **Out-of-scope:** draft-reply otomatik-gönderim (HITL), teklif, memory, Pub/Sub push.
- **Tasks:** `sequences.ts` state machine (pending/sent/cancelled/replied + TR iş-günü/tatil); Gmail History poll (15dk cron, `gmail.readonly`); classify deterministik-prefilter→LLM→confidence gate; stop-on-reply/bounce/opt-out (deterministik iptal); reply-intent→pipeline status önerisi.
- **Dependencies:** Sprint 1 (send + threads); WS E devam.
- **Migrations:** 051 (inbound_messages + reply_classifications); 046 thread/history alanları kullanımda. **H, doğrula.**
- **Acceptance (26 Senaryo 3+4+5):** sent→thread kaydedildi→yanıt-yok→iş-günü follow-up görevi→onayla→gönder→yanıt gelince sonraki iptal; reply→intent sınıf→confidence görünür→pipeline güncelleme önerisi→reply draft→onaysız gönderilmez; unsubscribe→suppression güncel→tüm pending iptal→yeni outreach bloke.
- **Tests:** `eval.sales.classify_reply` (injection fixture), `eval.pipeline.schedule_follow_up`, `eval.pipeline.update_status` (parity); T2/T8.
- **Rollback:** classify/sync `active=false`→manuel-yapıştır test moduna; follow-up cron devre-dışı.
- **Demo:** gönderilen mail→yanıt-yok→follow-up görevi; gelen yanıt→sınıf+pipeline önerisi; unsubscribe→tüm pending iptal.

---

## Sprint 3 — Offers + portfolio matching + proposals

- **Kullanıcı sonucu:** Olumlu yanıt/nitelikli leade modüler teklif taslağı (gerçek portfolyo kanıtıyla, fiyat AI-uydurmadan); teklif versiyon zinciri.
- **Scope:** WS C — `match-portfolio`, `build-offer`, `generate-proposal`, `verify-company`. Portfolio elle-giriş seed.
- **Out-of-scope:** memory-öğrenme, Voice DNA, performans-öğrenme.
- **Tasks:** `portfolio_items` operatör-giriş UI + deterministik skor (uydurma-örnek YOK); offer-angle (evidence→angle); proposal version chain (append-only, superseded); price rules (`PRICING_RULES.md`); proposal gate (pain+decision_maker+budget, mig 020) korunur.
- **Dependencies:** Sprint 1-2 (dossier+pipeline); WS C (evidence'a bağlı, E-bağımsız → aslında Sprint 1'e paralel başlayabilir).
- **Migrations:** 048 (portfolio_items+portfolio_claims), 049 (proposals+proposal_outcomes). **H, doğrula.**
- **Acceptance:** proposal yalnız gate-geçmiş leade; fiyat price-rules/girdi (AI sayı-uydurmaz); portfolio-match approved-claim-only, eşleşme-yoksa boş; version chain silmez.
- **Tests:** `eval.sales.match_portfolio`, `eval.sales.build_offer_angle`, `eval.sales.draft_proposal` (fiyat-grounding); T15 (proposal grant).
- **Rollback:** proposal/portfolio skill `active=false`; migration additive drop.
- **Demo:** nitelikli lead→portfolyo-kanıtlı teklif taslağı v1→düzenle→v2 (v1 superseded).

---

## Sprint 4 — Memory + voice learning + relationship memory + eval

- **Kullanıcı sonucu:** Sistem lead-özel tercihleri hatırlar (scoped, sızıntısız); tekrarlanan operatör düzeltmesi Voice DNA adayı olur (onayla→gelecek taslakta kullan); ilişki hafızası taslakları zenginleştirir.
- **Scope:** WS F — `extract-memory` (quarantine), scoped 5-katman, cross-lead sızıntı-koruması; WS D öğrenme — edit-delta→governance→`voice_pattern`; eval genişleme (cross-family judge).
- **Out-of-scope:** oto-follow-up, Pub/Sub push, Brain-active iş-rotasında (V2).
- **Tasks:** `agent_memory` scope (mig 050) + retrieval `scopeId`-zorunlu (filter-before-retrieval); `lead:<id>:` namespace; quarantine→active (occurrence≥3/HITL); Voice DNA edit-delta→quarantine→onaylı pattern; decay (half-life 30g).
- **Dependencies:** Sprint 1-2 (gerçek yanıt/edit verisi E'den); **namespace ayrımı reply-ingest'ten ÖNCE — aslında Sprint 2 öncesi şema hazır** (21 §3).
- **Migrations:** 050 (agent_memory scope + voice_pattern type + decay). **H, doğrula.**
- **Acceptance (26 Senaryo 7):** aynı ifade 3 taslakta silinir→tercih adayı→tek-düzenlemede kalıcı-yazım YOK→onaylı hafıza sonraki taslakta; Lead A tercihi Lead B'ye sızmaz.
- **Tests:** `eval.memory.extract_sales_memory` (cross-scope izolasyon), Voice DNA parity; T7.
- **Rollback:** memory retrieval `active=false`→statik persona; mig 050 additive (kolonlar null-tolere).
- **Demo:** Lead A tercihi hatırlanır+kullanılır; Lead B'de görünmez; 3-kez-silinen ifade Voice DNA adayı.

---

## Sprint sonrası (V2 backlog)

Performans-öğrenme · segment-optimizasyon · next-best-action(gelişmiş) · kontrollü oto-follow-up (varsayılan KAPALI) · account planning · predictive prioritization · Pub/Sub push (OIDC-doğrulama ayrı güvenlik incelemesi) · prompt cache · Brain-active iş-rotasında. Hepsi HITL-kapılı; otonom gönderim asla yok.

## Açık sorular
- [BLOKÖR] Gmail OAuth Sprint-0'da alınamazsa: Sprint 1 Gmail-adımları shadow, cockpit+deterministik+portfolyo (Sprint 3 kısmı) öne çekilir.
- [ASSUMPTION] Migration numaraları plan §5 kanonik; her sprint başında canlı `list_migrations` ile doğrulanır (repo≠canlı-DB drift, 27 V1 riski).
- [ASSUMPTION] Sprint süreleri ≤2 hafta hedefi; kapsam sabit, süre esner (kapsam-disiplini).
