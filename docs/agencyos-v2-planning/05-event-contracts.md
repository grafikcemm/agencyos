# 05 — Event Contracts (Olay Sözleşmeleri)

> Dalga 1 · load-bearing. Satış döngüsünün 24 mantıksal olayı: her biri için idempotency key · actor · timestamp · source · payload şeması · trace ID · related entity · privacy classification.
>
> **Taşıma modeli (plan §2/§5, MVP gerçeği):** Bu olaylar **ayrı bir event-bus KURMAZ**. MVP'de her olay mevcut `agent_tasks` kuyruğu üstünde **mantıksal olay** olarak yaşar (`21-data-worker` [CERTAIN]: `agent_tasks` = Postgres-as-queue, `mig 038` lease/retry). İki gerçek taşıma yüzeyi:
> 1. **Kuyruk adımı** — olay bir sonraki işi tetikliyorsa `agent_tasks` insert (idempotent doğal anahtar).
> 2. **Trace span** — olay yalnız gözlemlenecekse `run_spans` (`mig 044`, redacted) satırı.
>
> **Durable `lead_events` tablosu OPSİYONELDİR** (plan §5, `mig 053`). Aşağıdaki "Kalıcılık" sütunu her olayın MVP'de nereye yazıldığını belirtir: **durable** (kendi tablosu / lead_events) vs **ephemeral** (yalnız `run_spans`, retention_until sonrası düşer).

---

## 1. Ortak zarf (envelope) — her olayda sabit

```ts
interface EventEnvelope {
  event: string            // 'lead.discovered' … kanonik ad (bu doküman sahibi)
  event_id: string         // uuid — üretim anında
  idempotency_key: string  // doğal anahtardan türetilir (§3) — çift-işlem engeli
  actor: string            // 'system:<worker>' | 'operator' | 'cron:<name>'
  occurred_at: string      // ISO 8601 timestamptz (UTC)
  source: string           // üreten worker/route (ör. 'gmail-sync', 'reply-process')
  trace: { run_id: string | null; step_id: string | null }  // AgentRun (directives/agent_tasks)
  entity: { type: string; id: string }   // ilgili varlık (Lead/EmailMessage/Proposal…)
  privacy: 'public' | 'internal' | 'confidential' | 'secret'  // mig 043:27-28 enum — AYNI sözlük
  payload: Record<string, unknown>        // olaya özel (§4)
}
```

- **trace ID:** her olay bir AgentRun bağlamında üretilir; `run_id`/`step_id` `directives`/`agent_tasks`'a bağlanır. Kuyruk-dışı üretim (ör. operatör UI) `run_id=null` olabilir.
- **privacy:** `approval_requests.data_sensitivity` enum'u birebir yeniden kullanılır (yeni sözlük yok). E-posta gövdesi taşıyan olaylar en az `confidential`.
- **redaction:** `run_spans`'a yazılan hiçbir olay ham prompt/e-posta gövdesi/PII taşımaz (`mig 044:18` `redactAttributes`); yalnız id + özet.

## 2. Kalıcılık modeli — durable vs ephemeral

| Kalıcılık | Nerede | Hangi olaylar |
|-----------|--------|---------------|
| **durable (kendi tablosu)** | ilgili tablo satırı olayı kalıcılaştırır | `email.sent`(email_messages), `email.replied`/`reply.classified`(reply_classifications), `proposal.created/sent`(proposals), `memory.approved`(agent_memory), `email.bounced`(suppression_list) |
| **durable (lead_events, ops. 053)** | append-only olay defteri (opsiyonel) | `lead.qualified/disqualified`, `opportunity.won/lost` — pipeline denetim izi gerekiyorsa |
| **ephemeral (run_spans)** | 30g trace, sonra özetlenip düşer | `dossier.generated`, `service.matched`, `outreach.drafted`, `followup.due`, `agent.failed`, `model.fallback.used`, `memory.proposed` |

**Karar:** MVP durable olayları zaten **kendi tablolarına** yazıldığı için `lead_events` (053) opsiyonel kalır. Ayrı append-only defter yalnız "pipeline zaman-çizelgesi UI" istenirse açılır (C6: MVP-fazlası).

## 3. Idempotency kuralları (doğal anahtar → key)

Hepsi deterministik; aynı olay iki kez işlense de tek etki. LLM yok (state-transition saf kod).

| Olay | idempotency_key formülü |
|------|--------------------------|
| lead.discovered | `google_place_id` (yoksa `person_lead_id`) — leads dedup (`mig 001:16`) |
| lead.updated | `lead_id + ':' + field + ':' + updated_at` |
| lead.qualified/disqualified | `lead_id + ':' + assessment_id` |
| dossier.generated | `lead_id + ':' + run_date` (`lead_assessments` 1/gün) |
| service.matched | `assessment_id + ':' + service_slug` (`lead_service_matches` doğal) |
| outreach.drafted | `outreach_message_id` |
| outreach.approved | `approval_request.idempotency_key` (`mig 043:32` UNIQUE) |
| email.draft.created | `gmail_draft_id` (yoksa `outreach_message_id`) |
| email.sent | `gmail_message_id` (`email_messages` UNIQUE) |
| email.bounced | `bounce_message_id` |
| email.replied | `gmail_message_id` (inbound, UNIQUE) |
| followup.due | `lead_id + ':' + step` (`follow_up_sequences` doğal) |
| followup.cancelled | `lead_id + ':' + step + ':' + reason` |
| reply.classified | `email_message_id` (1 analiz/mesaj) |
| opportunity.created | `lead_id` (ilk proposal-stage geçişi) |
| proposal.created | `lead_id + ':' + version` (`proposals` UNIQUE) |
| proposal.sent | `proposal_id` |
| opportunity.won/lost | `lead_id + ':' + status` |
| memory.proposed | `scope_type + ':' + scope_id + ':' + layer + ':' + memory_key` |
| memory.approved | `agent_memory.id` |
| agent.failed | `step_id + ':' + attempt` |
| model.fallback.used | `step_id + ':' + primary_model + ':' + fallback_model` |

---

## 4. Olay sözleşmeleri (per-event)

Her olay: **Actor** · **Source** · **Entity** · **Privacy** · **Kalıcılık** · **Payload** (alan: tip).

### Lead yaşam döngüsü

**`lead.discovered`** — Actor `cron:daily-scan` · Source `leads/scan.ts` · Entity `Lead` · Privacy `internal` · Kalıcılık durable(`leads` upsert)
```
lead_id: string · google_place_id: string|null · person_lead_id: string|null
sector: string · city: string · source: 'places'|'apollo'|'city_sector'
potential_score: number · tier: 'A'|'B'|'C'|'D'|null · discovered_at: string
```

**`lead.updated`** — Actor `system:research-agent`|`operator` · Source `runner`/`api/db` · Entity `Lead` · Privacy `internal` · Kalıcılık durable(`leads`)
```
lead_id: string · field: string · old_value: unknown · new_value: unknown
reason: string · evidence_ids: string[]   // CRM auto-update grounding (K3)
```

**`lead.qualified`** — Actor `system:qualification-agent` · Source `highQualityLeadEngine`/council · Entity `Lead` · Privacy `internal` · Kalıcılık durable(`lead_assessments`; ops. lead_events)
```
lead_id: string · assessment_id: string · qualified: true
score_card: { icp:number; need:number; timing:number; data_confidence:number;
              contactability:number; service_fit:number; portfolio_fit:number;
              value:number; effort:number; risk:number; readiness:number }
reasons: string[] · evidence_ids: string[]
```

**`lead.disqualified`** — Actor `system:qualification-agent`|`operator` · Source council/HITL override · Entity `Lead` · Privacy `internal` · Kalıcılık durable(`lead_assessments`+`lead_match_feedback` on override)
```
lead_id: string · assessment_id: string · reason_code: string
disqualification_reason: string · human_override: boolean
```

### Dossier & servis

**`dossier.generated`** — Actor `system:research-agent` (K3) · Source `build-lead-dossier` skill · Entity `Lead` · Privacy `confidential` (birleşik PII) · Kalıcılık ephemeral(`run_spans`) + `lead_assessments.chair_verdict`
```
lead_id: string · run_date: string · signal_count: number
evidence_ids: string[] · recommended_service_slugs: string[]
role_context: { contact_id:string|null; role:string|null }   // rol-aware (K2)
cost_usd: number
```

**`service.matched`** — Actor `system:service-agent` · Source `offerMatcher` (katalog-kilitli) · Entity `ServiceMatch` · Privacy `internal` · Kalıcılık durable(`lead_service_matches`)
```
lead_id: string · assessment_id: string · service_slug: string · rank: number
score: number · evidence_refs: string[] · reasons: string[]
// Kilit: service_slug yalnız katalogdan (mig 033:67) — halüsinasyon imkânsız
```

### Outreach & e-posta

**`outreach.drafted`** — Actor `system:outreach-agent` · Source `coldEmail.ts` + voice-guard/judge · Entity `MessageDraft` · Privacy `confidential` · Kalıcılık durable(`outreach_messages`)
```
outreach_message_id: string · lead_id: string · contact_id: string|null
angle: 'mini_audit'|'launch'|'hiring'|'before_after' · role: string|null
original_body_ref: string   // gövde run_spans'a YAZILMAZ, tablo referansı
voice_guard_passed: boolean · judge_score: number
```

**`outreach.approved`** — Actor `operator` (HITL) · Source `approval_requests` (`mig 043`) · Entity `MessageDraft` · Privacy `confidential` · Kalıcılık durable(`approval_requests`)
```
outreach_message_id: string · approval_request_id: string
approved_digest: string   // karar-anı digest (yürütme eşleşmesi, mig 043:37)
decided_by: string · decided_at: string
```

**`email.draft.created`** — Actor `system:email-ops` · Source `create-gmail-draft` skill · Entity `EmailMessage` · Privacy `confidential` · Kalıcılık durable(`outreach_messages.gmail_*`)
```
outreach_message_id: string · gmail_draft_id: string · gmail_thread_id: string|null
lead_id: string · to: string   // to = PII → privacy confidential
```

**`email.sent`** — Actor `operator`→`system:send-gmail` · Source `send-gmail` skill (onay-sonrası) · Entity `EmailMessage` · Privacy `confidential` · Kalıcılık **durable(`email_messages`)**
```
gmail_message_id: string · gmail_thread_id: string · message_id_header: string
lead_id: string · contact_id: string|null · to: string · subject: string
sent_at: string · outreach_message_id: string
// Ön-koşul: suppression_list kontrolü GEÇTİ + approval_requests executed
```

**`email.bounced`** — Actor `system:bounce-handling` · Source `gmail-sync` (DSN tespiti) · Entity `EmailMessage` · Privacy `confidential` · Kalıcılık **durable(`suppression_list`)**
```
gmail_message_id: string · bounce_message_id: string · address: string
bounce_type: 'hard'|'soft' · diagnostic: string
// hard → suppression_list anında upsert (source='bounce')
```

**`email.replied`** — Actor `system:gmail-sync` · Source `sync-email-thread` skill · Entity `EmailMessage` · Privacy `confidential` · Kalıcılık **durable(`email_messages` inbound)**
```
gmail_message_id: string · thread_id: string · in_reply_to: string
from: string · received_at: string · lead_id: string
// Gövde DATA, talimat değil (C8); enqueue → reply-process
```

### Follow-up & reply intelligence

**`followup.due`** — Actor `cron:follow-up-scheduler` · Source `sequences.ts` `processDueSequences` · Entity `FollowUp` · Privacy `internal` · Kalıcılık ephemeral(`run_spans`) + durable(`follow_up_sequences.state`)
```
lead_id: string · step: number · channel: string · scheduled_at: string
business_days_waited: number   // TR iş-günü/tatil deterministik
```

**`followup.cancelled`** — Actor `system:follow-up-scheduler` · Source deterministik state-transition · Entity `FollowUp` · Privacy `internal` · Kalıcılık durable(`follow_up_sequences.state='cancelled'`)
```
lead_id: string · step: number · reason: 'reply'|'bounce'|'opt_out'|'manual'
cancelled_at: string
// Yanıt/bounce/opt-out/suppression → açık job'lar iptal (LLM yok)
```

**`reply.classified`** — Actor `system:reply-process` · Source `classify-reply` skill · Entity `ReplyAnalysis` · Privacy `confidential` · Kalıcılık **durable(`reply_classifications`)**
```
email_message_id: string · lead_id: string
intent: 'olumlu'|'itiraz'|'soru'|'ret'|'opt_out'|'ooo'|'bounce'
sentiment: string · objection: string|null · suggested_action: string
confidence: number · model: string · run_id: string · cost_usd: number
// Düşük confidence → otomatik iş yok; cevap TASLAĞI (HITL), göndermez
```

### Opportunity & proposal

**`opportunity.created`** — Actor `system:pipeline-manager`|`operator` · Source `pipelineGate.ts` · Entity `Lead` · Privacy `internal` · Kalıcılık durable(`leads.status='proposal'`; ops. lead_events)
```
lead_id: string · from_status: string · to_status: 'proposal'
// Gate: pain_point + decision_maker + budget_band zorunlu (yoksa 422)
```

**`proposal.created`** — Actor `system:proposal-agent` · Source `generate-proposal` skill · Entity `Proposal` · Privacy `confidential` · Kalıcılık **durable(`proposals`)**
```
proposal_id: string · lead_id: string · version: number
price_snapshot: object · evidence_refs: string[] · supersedes: string|null
// Fiyat AI-uydurmaz (price-rules/operatör); version chain append-only
```

**`proposal.sent`** — Actor `operator`→`system:email-ops` · Source `send-gmail` · Entity `Proposal` · Privacy `confidential` · Kalıcılık durable(`proposals.status='sent'`)
```
proposal_id: string · lead_id: string · gmail_message_id: string|null · sent_at: string
```

**`opportunity.won`** — Actor `operator` · Source pipeline/`projects` insert · Entity `Opportunity` · Privacy `internal` · Kalıcılık durable(`projects`+`leads.status='converted'`; ops. lead_events)
```
lead_id: string · project_id: string · setup_fee: number · monthly_fee: number · won_at: string
```

**`opportunity.lost`** — Actor `operator`|`system:reply-process` · Source pipeline/`ret` intent · Entity `Opportunity` · Privacy `internal` · Kalıcılık durable(`leads.status='lost'`; ops. lead_events)
```
lead_id: string · reason: string · lost_at: string
```

### Memory (governance)

**`memory.proposed`** — Actor `system:relationship-memory` · Source `extract-memory` skill · Entity `MemoryItem` · Privacy = kayıt `sensitivity` (default `internal`) · Kalıcılık durable(`agent_memory.status='quarantine'`)
```
memory_id: string · scope_type: 'lead'|'person'|'global' · scope_id: string|null
layer: 'contact'|'company'|'outreach'|'offer'|'preference' · memory_key: string
sensitivity: string · confidence: number · occurrences: number
source_evidence_id: string|null · supersedes_id: string|null
```

**`memory.approved`** — Actor `system:governance`(occurrence≥3) | `operator`(HITL) · Source `governance.ts` `promotionDecision` · Entity `MemoryItem` · Privacy = `sensitivity` · Kalıcılık **durable(`agent_memory.status='active'`)**
```
memory_id: string · scope_type: string · scope_id: string|null · layer: string
human_approved: boolean · confidence: number · last_verified_at: string
// confidential/secret + human_approved=false → retrieval'da GİZLİ
```

### Agent / model sağlık

**`agent.failed`** — Actor `system:<worker>` · Source `runner`/`lease.ts` · Entity `AgentRun.step` · Privacy `internal` · Kalıcılık ephemeral(`run_spans` status='error`) + durable(`agent_tasks.status='error'`)
```
step_id: string · run_id: string · agent: string · error_code: string
error_summary: string   // redacted, ham stack YOK
attempt: number · max_attempts: number · will_retry: boolean · backoff_ms: number
```

**`model.fallback.used`** — Actor `system:openrouter` · Source central Model Registry (`callOpenRouter`) · Entity `ModelUsage` · Privacy `internal` · Kalıcılık ephemeral(`run_spans`) + durable(`ai_cost_logs`)
```
step_id: string · preset: string   // 'agencyos-professional' …
primary_model: string · fallback_model: string · reason: 'not_found'|'timeout'|'error'|'ceiling'
attempt: number · actual_cost_usd: number|null
// Görünür fallback log ZORUNLU (§4 model policy) — sessiz 404 riskini kapatır
```

---

## 5. Güvenlik & privacy notları

- **PII taşıyan olaylar** (`email.*`, `reply.classified`, `dossier.generated`, `outreach.*`, `proposal.*`): en az `confidential`; gövde/adres olay payload'ında **referans (id) olarak** taşınır, **ham metin `run_spans`'a yazılmaz** (`mig 044:18`).
- **Prompt-injection sınırı:** `email.replied`/`reply.classified` payload'ındaki e-posta içeriği **DATA**'dır; herhangi bir tüketici onu talimat olarak yorumlamaz (C8, plan §21 tehdit modeli).
- **HITL zorunluluğu:** `email.sent`/`proposal.sent`/`outreach.approved` yalnız `approval_requests` `executed` + `approved_digest` eşleşmesiyle üretilebilir (`mig 043` — "X'i onayla, Y'yi çalıştır" yapısal imkânsız).
- **Suppression kapısı:** `email.sent` üretiminin ön-koşulu `suppression_list` kontrolünün geçmesidir; `email.bounced`/opt-out → anında `followup.cancelled` + suppression upsert.
- **Cross-lead izolasyon:** `memory.*` olayları `scope_id` taşır; retrieval filtresi SQL'de zorunlu (asla olay tüketicisinde post-hoc).

## 6. Tüketici haritası (hangi worker hangi olayı dinler)

| Olay | Tüketici (enqueue eder) |
|------|--------------------------|
| lead.discovered/updated | qualification-agent, research-agent |
| lead.qualified | service-agent → outreach-agent |
| service.matched | outreach-agent |
| outreach.approved | email-ops (create-gmail-draft → send-gmail) |
| email.sent | follow-up-scheduler (ilk step planla) |
| email.replied | reply-process (classify) + follow-up-scheduler (iptal) |
| reply.classified | pipeline-manager (status), proposal-agent (olumlu→teklif) |
| email.bounced | suppression-update, follow-up-scheduler (iptal) |
| memory.proposed | governance (promotion) |
| agent.failed | error path (retry/notifyOps) |
| model.fallback.used | cost-aggregation, observability |

> Tüm tüketiciler `agent_tasks` insert eder (yeni kuyruk yok); idempotency doğal anahtar (§3) çift-işlemi önler; her adım `run_spans` yazar.
