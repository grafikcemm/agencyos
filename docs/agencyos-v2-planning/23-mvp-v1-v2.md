---
Doküman: 23-mvp-v1-v2
Dalga: 2 (Motor — faz yerleşimi; Dalga 1 sözleşmelerine referans)
Tarih: 2026-07-11
Durum: Özellik→faz haritası (24-parallel-workstreams.md ve 25-sprint-roadmap.md ile senkron)
Bağımlılık: plan K1-K4, 06-agent-registry.md (§4 aktivasyon kapıları), 07-skill-registry.md (★MVP=10 skill), 21-security-and-compliance.md (faz güvenliği); araştırma 00-executive-summary.md, RESEARCH-SYNTHESIS.md
---

# AgencyOS V2 — MVP / V1 / V2 Faz Yerleşimi

## 0. İlke — enterprise mimari MVP'de YOK; K1 döngüsü çekirdek

Araştırma bulgusu: AgencyOS AI-native Revenue OS vizyonunun **~%65'ini zaten içeriyor** (çoğu shadow/off-by-default, parity-guard'lı — 00-executive-summary §1). Doğru strateji **yeni sistem kurmak değil**, mevcut temeli **aktive etmek + 7 gerçek eksiği doldurmak**. MVP = plan K1 satış döngüsünü **kapatan minimum**; enterprise event-bus, çok-tenant, gelişmiş dashboard, otonom-gönderim MVP'de **YOK**.

**Faz felsefesi (anti-bloat):**
- **MVP** = "gönder → yanıtı gör → sonraki adımı tek ekrandan yönet" döngüsünü **HITL ile** kapat. En yüksek kullanıcı değeri burada.
- **V1** = kontrollü otomasyon — reply-driven state, follow-up state machine tamamı, ilişki hafızası, teklif motoru.
- **V2** = öğrenen Revenue OS — performans-öğrenme, segment-optimizasyon, next-best-action, kontrollü oto-follow-up (varsayılan KAPALI).

**Değişmez (her fazda):** HITL pazarlıksız · premium model asla-default · deterministik işe LLM yok · uydurma yok · tek-operatör · Görev/Alışkanlık/Rutin (LIFE DB) dokunulmaz.

**OAuth notu (K1 kritik):** Araştırma "MVP Gmail'siz" derdi (00 §5); **plan K1 bunu ezdi** — Gmail döngüsü MVP-çekirdeği. Sonuç: **Gmail OAuth = Sprint-0 önkoşulu** (fabrike edilemez tek blokör, `assumption:` operatör yetkilendirir). OAuth, gönderimi (`send-gmail`) MVP'ye **çeker**; ama HITL onay + suppression + opt-out pazarlıksız kalır. OAuth gecikirse: deterministik skiller + cockpit + portfolyo + model-fix Gmail'siz ilerler (fallback yol), `send-gmail`/reply shadow'da bekler.

---

## 1. MVP — K1 satış döngüsü (Bugün cockpit + Gmail HITL gönderim)

**Kullanıcı sonucu:** Sabah `/bugun` kokpitini aç → incelenecek lead'i gör → kanıtlı dossier + rol-aware önerilen hizmet/kanıt → rol-aware kişiselleştirilmiş taslak (Voice Guard geçmiş) → **onayla → Gmail'den gönder** → gönderilen takip edilir → suppression + audit her adımda.

| Özellik | Skill/rol (07/06) | Neden MVP | Not |
|---|---|---|---|
| **Bugün kokpiti** (recomposition) | Workstream A; mevcut `/command-center` temeli | Tek satış merkezi; 4 dağınık ekran birleşir (yeni ekran şişkinliği YOK) | incelenecek lead + onay-bekleyen outreach + follow-up zamanı + yeni yanıt + görev/rutin özeti |
| **Lead Dossier** | ★`build-lead-dossier` | Otonom araştırma çekirdeği (K3); kanıt-zincirli | `lead.audit_website` sarar; her iddia `evidence_id`'li |
| **Açıklanabilir scoring** | ★`score-lead` (WIRED, deterministik) | Halüsinasyon-skor imkânsız; skor kartı görünür | `score_reasons[]`; yeni `lead_scores` tablosu AÇILMAZ |
| **Service matching** | ★`match-service` (WIRED, deterministik) | Katalog-kilitli; uydurma-hizmet imkânsız | yalnız `service_catalog` slug'ından |
| **Portfolio matching** | `match-portfolio` (deterministik) → **MVP: elle giriş + skor** | Kanıt-parçası; uydurma-örnek yasak | `portfolio_items` seed operatör-manuel (mig 048); seed yoksa boş |
| **Rol-aware outreach draft** | ★`generate-outreach` | K2 rol-farkındalık (CTO→verimlilik, CFO→maliyet, sahip→büyüme) | edit-delta yakalar (K4, `original_body`/`final_body` mig 046) |
| **Voice Guard** | ★`review-outreach` (deterministik lint + cross-family judge) | Klişe/kanıtsız-övgü/footer/link denetimi gönderimden önce | `evidence_id`'siz bulgu reddedilir |
| **HITL approval** | mevcut `approval_requests` (mig 043) | K1 pazarlıksız; digest-lock çift-yürütme engeli | yeni onay sistemi KURULMAZ |
| **Gmail send** (approve→send) | ★`send-gmail` | K1 (L2 onayla→gönder) çekirdeği | idempotency `outreach_messages.id`; suppression pre-send gate |
| **Basic sent tracking** | mevcut `markMessageSent` + `email_messages` (mig 046) | "gönderildi mi" görünürlüğü | thread/message satırı |
| **Suppression** | `suppression_list` (mig 047) + `audit-compliance` | Opt-out yasal-zorunlu (KVKK/6563) | her gönderimin ön-koşulu |
| **Audit log** | `run_spans` (mig 044) + `approval_requests` + append-only tablolar | Her adım redacted iz | dedicated `audit_log` tablosu YOK (04 AuditLog) |
| **Cost tracking** | mevcut `ai_cost_logs` + `tool_cost_logs` (mig 052) | Maliyet-görünürlük; Places dahil | `actual_cost_usd` + `preset_key` |
| **Follow-up (temel)** | ★`schedule-follow-up` + ★`update-pipeline` | 5-7 iş günü hatırlatma; stop-on-reply | deterministik FSM; `sequences.ts` sarar |
| **Reply classify (temel)** | ★`classify-reply` | Gelen +/- filtre; injection-izole | etiket üretir, eylem tetiklemez; düşük-conf→needs_human |

**★MVP skill kümesi (07 §1): 10 skill** — build-lead-dossier, extract-signals, score-lead, match-service, generate-outreach, review-outreach, send-gmail, schedule-follow-up, classify-reply, update-pipeline.

**MVP dışı (bilinçli):** otomatik gönderim (HITL zorunlu), yüksek hacim, öğrenen Voice DNA (edit-capture var ama öğrenme V1+), ilişki hafızası aktif-kullanımı, teklif motoru, Pub/Sub push, gelişmiş eval dashboard, çok-adımlı otonom Brain-active.

**MVP güvenlik kapıları (21):** T5 (unauthorized send) + T6 (duplicate) + T8 (suppression) + T4 (token) canlı; T7 memory-namespace **şeması** MVP'de hazırlanır (mig 050) ama aktif-kullanım V1.

---

## 2. V1 — kontrollü otomasyon (reply-driven + teklif + hafıza)

**Kullanıcı sonucu:** Gönderdiğin maile gelen yanıt otomatik senkronlanır, sınıflandırılır (+/-/itiraz/soru), pipeline durumu **önerilir** (onayla-uygula); dönmeyen leade otomatik follow-up görevi; olumlu yanıta teklif taslağı; lead-özel ilişki hafızası taslakları zenginleştirir.

| Özellik | Skill/rol | V1 gerekçe |
|---|---|---|
| **Gmail reply-read/sync** | `sync-email-thread` (`gmail.readonly`, 15dk poll) | OAuth readonly scope; inbound thread |
| **Follow-up state machine (tam)** | `schedule-follow-up` + `recommend-next-action` | 5-7 iş günü TR-tatil/iş-günü; reply/bounce/opt-out iptal |
| **Reply Intelligence (tam)** | `classify-reply` + `draft-reply` (~19 sınıf) | deterministik prefilter→LLM→confidence gate |
| **Relationship memory** | `extract-memory` → quarantine (governed) | **T7 namespace ayrımı ZORUNLU-aktif V1'den ÖNCE** (21 §3) |
| **Offer Architect** | `build-offer` (deterministik açı + framing) | evidence→angle; internal/clientFacing split |
| **Proposal generator** | `generate-proposal` (fiyat AI-uydurmaz; version chain mig 049) | pipeline `proposal` gate (pain+decision_maker+budget) |
| **Advanced eval** | eval harness genişleme + cross-family judge | golden set + rubric her yeni skill |
| **Benchmark automation** | `17-model-benchmark-plan.md` — kalite-eşiği-geçen-en-ekonomik | premium otomatik seçilmez |
| **verify-company** | `verify-company` (domain/WHOIS/sektör) | hayalet-kayıt eleme |
| **create-gmail-draft** | `create-gmail-draft` (compose, teslimat değil) | taslak-Gmail; external HITL |
| **audit-deliverability** | `audit-deliverability` (SPF/DKIM/DMARC) | send V1'de bu geçene kadar shadow |

**V1 aktivasyon (06 §4):** deterministik roller (Qualification, Service&Offer match, Pipeline Manager, Compliance) önce active; Email Ops + Reply Intelligence Gmail scope + SPF/DKIM/DMARC tamamlanınca active.

---

## 3. V2 — öğrenen Revenue OS

**Kullanıcı sonucu:** Sistem geçmiş performanstan öğrenir (hangi açı/segment dönüşüyor); bir sonraki en iyi eylemi önerir; yüksek-confidence follow-up'ı (operatör açarsa, varsayılan KAPALI) kontrollü otomatik önerir; hesap-planı ve tahminsel önceliklendirme.

| Özellik | Kaynak | V2 gerekçe |
|---|---|---|
| **Performance learning** | feedback loop (`lead_match_feedback` genişleme) + eval | gerçek sonuç verisi (E'den) birikince |
| **Segment optimization** | `sectorRotation.ts`/`cityTargeting.ts` üstüne | hangi sektör×şehir×açı dönüşüyor |
| **Next best action (gelişmiş)** | `recommend-next-action` + performans-sinyali | FSM + öğrenilmiş öncelik |
| **Controlled auto-follow-up** | follow-up state machine + confidence gate | **varsayılan KAPALI**; hâlâ HITL-önerisi, otonom gönderim asla yok |
| **Account planning** | ilişki hafızası + pipeline geçmişi | çok-temaslı hesap görünümü |
| **Predictive prioritization** | scoring + performans-öğrenme | tahminsel lead sıralama |
| **Pub/Sub push reply** | Gmail `watch()` + History | OIDC-doğrulama ayrı güvenlik incelemesi (21 T14) |
| **Öğrenen Voice DNA (tam)** | edit-delta → governance quarantine→active `voice_pattern` (mig 050) | corpus bootstrap yok; MVP'de yakalanan delta V2'de öğrenmeye döner |
| **Brain active (iş-rotasında)** | `BRAIN_ACTIVE_ENABLED` çok-adımlı otonom | hâlâ HITL-kapılı; parity+eval yeşil şart |
| **Prompt cache** | 16 §4.9 (`cache_control`) | ~%15-20 council tasarrufu; MVP zorunlu değil |

---

## 4. Faz bağımlılık özeti (24-parallel-workstreams ile hizalı)

```
Sözleşme kapısı (Dalga 1 contracts + Gmail OAuth + model-fix)
        │
   MVP: E (Gmail send + basic reply/follow-up) ∥ A (Bugün cockpit)
        │  (+ B mevcut leadIntel, G-ince model-preset-pin, deterministik skiller)
        ▼
   V1: reply-driven state + D(Voice DNA capture→learn başlangıç) + F(memory) + C(offer/proposal)
        ▼
   V2: performans-öğrenme + oto-follow-up(KAPALI) + Pub/Sub push + Brain-active
```

**Kritik yol:** contract-gate → **E (Gmail)** → D/F (öğrenme, gerçek yanıt verisi E'den) → A tam-yüzey. MVP = **E + A + çekirdek döngü** (00 §7, 25-parallel-workstreams §5).

## 5. Açık sorular
- [BLOKÖR] Gmail OAuth — operatör yetkilendirmesi; gecikirse MVP Gmail'siz-fallback yola kayar (deterministik skiller + cockpit + portfolyo).
- [ASSUMPTION] `portfolio_items` seed'i operatörün gerçek işleri — yoksa portfolio-match boş döner (uydurma yasak).
- [ASSUMPTION] Voice DNA öğrenme eşiği (occurrence≥3 başlangıç) — doğrulanmadı, V1'de kalibre.
