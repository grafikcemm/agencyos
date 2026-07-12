---
Doküman: 33-revenue-roadmap-sprint1-3
Tarih: 2026-07-12
Durum: UYGULANABİLİR ROADMAP — P0/P1 düzeltme sprinti (auth, at-most-once send,
bypass kapama, scope allowlist, routing merkezileştirme, E2E) KAPANDIKTAN sonra
başlar. Otomatik mail bu maddeler + OAuth güvenlik incelemesi bitmeden AÇILMAZ.
Bağımlılık: 25-sprint-roadmap.md · 11/12/13/14 motor dokümanları ·
32-gmail-oauth-vault-design.md (görev 11) · mig 045/048-051/053 rezervasyonları
---

# AgencyOS V2 — Gelir Döngüsü Roadmap (Sprint 1-3)

Hedef metrik (North Star): aylık 120K TL → funnel: lead→contact→reply→meeting→
proposal→won. Her sprint bu funnel'ın bir halkasını CANLI veri üretir hâle getirir.

---

## Sprint 1 — /bugun gelir kokpiti + rol-aware kişiselleştirme (~1.5 hafta)

### 1A. /bugun kokpiti (WS A)
**Değer:** Operatör güne TEK ekrandan başlar; "bugün ne yapacağım" sorusu ölür.

| Panel | Veri kaynağı | Dosya |
|---|---|---|
| Bugün aranacak lead'ler | `leads.next_follow_up_at <= today` + A-tier günlük seçim | YENİ `src/app/(os)/bugun/page.tsx` + `src/lib/cockpit/today.ts` |
| Onay bekleyen taslaklar | `approval_requests.status='pending'` (action=send-gmail) | mevcut approvals repo |
| Cevaplar (yeni reply) | `email_messages.direction='inbound'` (Sprint 2'ye kadar boş-durum) | mig 046 |
| Geciken follow-up'lar | `follow_up_sequences.due_at < now AND done=false` | mevcut sequences.ts |
| Gönderim/reconciliation hataları | `outreach_send_attempts.state IN ('unknown','failed')` + `finalized=false` | mig 054 |
| Teklif bekleyen sıcak lead'ler | `leads.status='responded'` + pipelineGate discovery alanları | mevcut |

**Kabul kriterleri:**
- [ ] /bugun ≤2 sn yüklenir; 6 panelin HER birinde loading/empty/error/success tasarlı.
- [ ] Onay kartından tek tıkla onayla→dry-run send akışı çalışır (E2E: mevcut send-flow.spec genişler).
- [ ] `state='unknown'` attempt kokpitte kırmızı "Reconcile" aksiyonuyla görünür.
- [ ] /icraat-firsatlari HIDE; /dashboard+/tasks yönlendirme (silme ayrı PR).
- [ ] Playwright: bugun.spec.ts — 6 panel render + onay akışı.

### 1B. Rol-aware kişiselleştirme (WS D, mig 045)
**Değer:** "Web siteniz eski" yerine karar-vericinin diline göre açı → reply-rate artışı.

- **mig 045:** `contacts` (lead_id FK, full_name, role: owner/cto/cfo/marketing, email, source) — kanonik rezervasyon.
- `generate-outreach` girdisi: lead sektörü (`customerCategory`), rol (`contacts.role`), lead kanıtları (`lead_evidence`), hizmet kataloğu+fiyat (`service_catalog`), Ali Cem profesyonel tonu (settings persona).
- **Voice DNA v0:** `original_body` vs `final_body` delta'larından yasak-ifade listesi (`settings.voice_banned_phrases`); occurrence≥3 kuralı (memory governance deseni) — otomatik değil, operatör onaylı liste.
- **Kalite judge:** `review-outreach` → `agencyos-judge` preset (cross-family); `evidence_id`'siz iddia → revise.

**Kabul:** [ ] CTO/CFO/owner fixture'larına farklı açılar (eval.sales.draft_cold_email); [ ] yasak ifade taslakta çıkmaz (deterministik lint); [ ] mig 045 canlı + contacts CRUD drawer'da.

---

## Sprint 2 — Reply ingest + follow-up FSM (~2 hafta; OAuth ÖNKOŞUL)

**Blokör:** görev 11 (OAuth+Vault, doc 32) güvenlik incelemesiyle bitmiş olmalı — `gmail.readonly` olmadan bu sprint başlayamaz.

- **Thread sync:** `gmail-sync` cron (15 dk, CRON_SECRET) — `users.history.list(startHistoryId)`; `email_threads.last_history_id`; historyId kayması → full-list fallback (12 §A.5).
- **Reply classification:** deterministik prefilter (unsubscribe/bounce/OOO/auto-reply — LLM'siz) → LLM etiket `{intent, confidence}` (positive/negative/objection/question/opt_out/bounce/ooo); gövde LLM'e YALNIZ user-veri bloğu (T2); `reply_classifications` özet-yalnız (mig 051 inbound_messages opsiyonu değerlendirilir).
- **Suppression otomasyonu:** `opt_out`/hard-bounce → suppression upsert + TÜM pending follow-up iptal (deterministik; Senaryo 5 zaten E2E'de).
- **Follow-up FSM (FOLLOWUP_FSM_ENABLED arkasında):** `businessDays.ts` + `trHolidays2026.ts` (12 §B.3); `processDueSequences`'a lead-status guard (12 §B.4); dönüş yapmayana bağlama göre farklı-açı yeni taslak (12 §B.5) — **ilk sürümde her follow-up YENİDEN HITL onaylı** (L2; L3 yok).

**Kabul:** [ ] Injection fixture: gizli-talimatlı reply → etiket üretir, EYLEM üretmez (eval.sales.classify_reply); [ ] reply → pending follow-up'lar iptal (stop-on-reply); [ ] iş-günü hesabı hafta sonu/TR tatil atlar (unit); [ ] follow-up taslağı onaysız GÖNDERİLMEZ (mevcut state machine bunu yapısal garanti eder); [ ] kokpit "Cevaplar" paneli canlı.

---

## Sprint 3 — Teklif motoru + gelir analitiği (~2 hafta)

### 3A. Teklif motoru (mig 048/049)
- Akış: müşteri problemi (discovery alanları) → hizmet/paket eşleme (`match-service` rank-1) → fiyat (`service_catalog` + pricing overrides) → kanıt/portfolyo eşleştirme (mig 049 portfolio_items: sektör-etiketli iş örnekleri).
- Sektör-özel teklif şablonu; versiyonlama (`proposals.version` + parent FK) + HITL onay (approval_requests, digest-lock — send-gmail deseni).
- Çıktı: PDF/link (`/teklif/[id]` public-token'lı sayfa; token 30 gün TTL); teklif-sonrası takip follow-up FSM'e bağlanır (proposal 5 iş günü).

**Kabul:** [ ] Teklif YALNIZ katalog slug'larından (uydurma hizmet/fiyat imkânsız — deterministik); [ ] her teklif satırı kanıt/portfolyo referanslı; [ ] versiyon geçmişi görünür; [ ] onaysız teklif linki paylaşılamaz.

### 3B. Gelir analitiği
- Funnel: `lead.discovered→contacted(sent)→replied→meeting→proposal→won` — kaynak: outreach_send_attempts(sent) + reply_classifications + leads.status geçişleri; `metrics/funnel` route'u genişler.
- Kesitler: sektör (`customerCategory`) × kanal × mesaj açısı (`angle`); KPI = positiveReplyRate + bounceRate (open-rate BİLİNÇLİ dışarıda — 12 §B.7).
- Günlük önerilen aksiyon + beklenen gelir: `expected_monthly_value_tl` × aşama-olasılığı (başlangıç katsayıları statik, `lead_match_feedback` ile kalibre).

**Kabul:** [ ] /bugun'a "beklenen gelir" şeridi; [ ] funnel Playwright smoke; [ ] kesit sorguları indeksli (<500ms).

---

## Değişmezler (her sprint)
HITL pazarlıksız · at-most-once send makinesi TEK gönderim yolu · premium asla-default ·
deterministik işe LLM yok · LIFE DB dokunulmaz · her faz: tsc+lint+vitest(+eşikler)+build+
Playwright kanıt · migration'lar additive + onaylı · secrets asla koda/loga.
