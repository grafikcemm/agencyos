# AgencyOS V2 — MASTER PLAN (tek-yer netlik)

> Dalga 3 · sentez. Bu doküman suite'in **yönetici özeti**dir: her konu tek sıkı bölüm + derin dokümana işaretçi. Hiçbir bölüm derin dokümanın kopyası değildir; çelişki durumunda derin doküman kazanır. Tarih: 2026-07-11. Kaynak: onaylı plan `agencyos-v2-ethereal-possum.md` + 28 sibling doküman (bu dizinde).
>
> **Önce oku sırası:** MASTER-PLAN (bu) → `FIRST-SPRINT.md` → `IMPLEMENTATION-HANDOFF.md`. Geri kalan 25 doküman derinlik.

---

## 0. Kilitli Kararlar (K1–K4) — ezilemez

| # | Karar | Sonuç |
|---|-------|-------|
| **K1** | **Gmail e-posta döngüsü MVP çekirdeği** — L2: ben onaylarım → sistem gönderir → takip eder → 5-7 iş günü follow-up | Gmail OAuth = **Sprint-0 önkoşulu** (fabrike edilemez tek blokör). Araştırmanın "MVP Gmail'siz" görüşü kullanıcı isteğiyle ezildi; ama **HITL onay + suppression + opt-out pazarlıksız**. → `12` |
| **K2** | **ICP B2B-tech'e genişletildi + rol modeli** | Mevcut TR-KOBİ/tasarım sinyalleri KORUNUR; üzerine `contacts.role` (owner/CTO/CFO/marketing) + firmografik/teknik sinyaller katmanlanır. Personalizasyon rol-farkındalıklı: CTO→verimlilik, CFO→maliyet, sahip→büyüme. → `08`, `11` |
| **K3** | **Otonom araştırma ajanı = mevcut worker + skill** | Ayrı VM/süreç YOK. `agent_tasks` kuyruğu + cron worker + güçlendirilmiş `build-lead-dossier`. Döngü: araştır→sinyal→CRM auto-update→skor. → `08` §3, `19` |
| **K4** | **Voice DNA = persona seed + edit-delta öğrenme** | Mevcut `coldEmail.ts` persona seed; `original_body`/`final_body` farkı yakalanır → governance quarantine → occurrence≥3 veya HITL ile `voice_pattern` active. Corpus bootstrap YOK. → `11` §6, `15` §7 |

---

## 1. Problem + hedef ürün

**Problem:** AgencyOS bugün lead **buluyor, puanlıyor, kategorize ediyor, eşleştiriyor, pipeline'da takip ediyor** — ama satış döngüsünü **kapatamıyor**. Gerçek gönderim yok (`markMessageSent` yalnız DB satırı `sent` yapar), reply/thread-sync yok, follow-up üç tutarsız kural setine dağınık, rol-aware personalizasyon yok, öğrenen hafıza mantığı var ama **hiç kullanılmıyor**.

**Hedef ürün: kişisel Revenue OS.** Tek operatör (Ali Cem) için, mevcut deterministik çekirdeğin (leadScoringV3, offerMatcher, customerCategory, council) üstüne **kapanış halkası** eklenir: rol-özel taslak → onay → Gmail gönderim → takip → yanıt anlama → sonraki eylem. Araştırma bulgusu: vizyonun ~%65'i zaten repoda (çoğu shadow/off) — strateji **yeni sistem kurmak değil, mevcuti aktive etmek + 7 gerçek eksiği doldurmak**. → `01-final-product-spec.md`, `00-research-review.md`

**Ne DEĞİL:** çok-ajanlı orkestra, ayrı VM, kurumsal CRM, otomatik gönderim, corpus-bootstrap voice, enterprise event-bus.

---

## 2. Bir bakışta: ne var / ne yeni / ne acil

| | Öğe | Durum |
|---|---|---|
| **VAR (koru, tüket)** | leadScoringV3 + highQualityLeadEngine (deterministik skor), offerMatcher + service_catalog (~40 paket, katalog-kilitli), customerCategory (7 kategori, AI yalnız `otomasyon_fit`), council C1-C4 (budget-cap'li), `agent_tasks` kuyruk + lease/retry, HITL `approval_requests` digest-lock (mig 043), `run_spans` trace (mig 044), lethal-trifecta guard, SSRF `guardedFetch`, pipelineGate, coldEmail persona, follow_up_sequences şeması | Değiştirilmez; V2 üstüne bağlanır |
| **UYUYAN (aktive et)** | Brain v2 (flag OFF), skill registry (3 skill wired / 21 hedef), `agent_memory` + `governance.ts` (kullanım SIFIR), FollowUpWidget, eval harness | Shadow→eval→parity→active yolu mevcut (06 §4) |
| **YENİ (asıl build)** | Gmail gönderim/sync (`outreach/gmail.ts` — tek gerçek yeni dış entegrasyon), Contact+Role (045), EmailThread/Message (046), Suppression/Consent (047), Portfolio (048), Proposal kalıcılık (049), memory scope (050), Reply Intelligence (051), tool_cost_logs (052), BUGÜN kokpiti (recompose), iş-günü follow-up FSM, rol-aware outreach, Voice edit-delta | 18 yeni skill + 9 migration; sıfır yeni ajan, sıfır yeni kuyruk |
| **ACİL (Sprint 0)** | **① Model routing:** 3 canlı model ID'si OpenRouter'da 404 (`gemini-2.5-flash-lite`, `claude-haiku-4-5`, `deepseek-v4-pro`) — fallback/timeout/retry YOK, `draft_proposal` fiilen patlıyor olabilir (`unverified:`). **② Gmail OAuth** (fabrike edilemez). **③ Contract-gate** (04/05/06/07/16 donması) | → `16` §1, `25` Sprint 0 |
| **DOKUNULMAZ** | Görev/Alışkanlık/Rutin (`/gorevler`, `/aliskanliklar`), LIFE DB (`xcqrk…`), Kariyer Radarı (`/kariyer`) | Hiçbir satış rolü/skill/migration temas etmez |

---

## 3. Nihai kullanıcı akışı (3 çekirdek akış) → `03-user-flows.md`

- **Sabah:** BUGÜN kokpitini aç (≤1 adım) → 6 sayaç (incelenecek lead · onay bekleyen · follow-up · yeni yanıt · teklif · riskli) + 2 council fırsatı + follow-up/riskli şeritleri. Kokpit read-only; asıl iş gece cron'unda yapılmıştır. Birincil görev ("bu lead'e outreach gönder") ≤3 adım: kokpit → "Taslağı gör" → "Onayla ve gönder".
- **Yanıt:** Gmail sync (15dk poll) → deterministik prefilter (bounce/OOO/unsubscribe, $0) → LLM classify (+/- + ~19 sınıf) → confidence gate → follow-up stop-on-reply → sonraki eylem önerisi → cevap TASLAĞI (asla auto-send).
- **Teklif:** gate geçmiş lead (pain+decision_maker+budget zorunlu) → versiyonlu teklif (fiyat AI-uydurmaz) → HITL onay → opsiyonel gönderim.

**Değişmez omurga:** her dış-etki HITL digest-lock'lu; gelen e-posta DATA; classify/send ayrı adım (trifecta); suppression her gönderimde zorunlu; her durum (loading/empty/error/success) tasarlı.

## 4. Nihai navigasyon → `02-final-information-architecture.md`

```
TOP (dokunulmaz):  Alışkanlıklar · Aktif Görevler
BUGÜN:             /command-center (recompose — YENİ sayfa DEĞİL) · Asistan
PIPELINE:          Lead Radar (/harita) · Pipeline (6 kolon, korunur) · Fırsatlar (arşive iner) · Projeler · Hizmetlerim
YAŞAM (dokunulmaz): Gelişim · Akademi · Kütüphane · Finans
SİSTEM:            Ajanlar (MOVE) · Konsol (MOVE) · Modeller/Gmail/Costs/Logs/Compliance (yeni panel/sekme) · Workers · Ayarlar
```

Verdict sayımı: **KEEP 15 · MERGE 1** (`/firsatlar`) · **MOVE 2** (`/agents`, `/konsol`) · **HIDE 1** (`/icraat-firsatlari` — mock) · **DELETE 2** (`/dashboard`, `/tasks` — orphan). Yeni route açılmaz; teknik metrikler BUGÜN'e yığılmaz.

---

## 5. Veri mimarisi + migration ownership → `04-domain-model.md`, `19-data-and-worker-architecture.md`

- **Firma = lead aynı satır** (`leads`, ayrı `companies` yok); `person_leads` (Apollo) ayrık; `contacts` (045) köprü. Yeni tablolar politikasız-RLS + `REVOKE ALL` + additive/idempotent + elle SQL Editor deseni.
- **Kanonik migration sırası (sahibi `19`; hepsi App DB only, LIFE DB'ye asla):** 045 contacts+rol · 046 email_threads/messages + outreach_messages additive (`original_body`/`final_body`/`gmail_*`) + gmail_accounts (öneri) · 047 suppression+consent · 048 portfolio · 049 proposals · 050 agent_memory scope · 051 reply intelligence · 052 tool_cost_logs · 053 (ops.) lead_events+signals. Repo en yüksek dosya 044 → **045 serbest** [doğrulandı]; her sprint başında canlı `list_migrations` re-verify.
- **Kuyruk:** yeni motor KURULMAZ — `agent_tasks` = Postgres-as-queue (lease/retry mevcut). 15 worker sözleşmesi + 5 yeni cron (gmail-sync, follow-up, cost-aggregation, model-health, data-expiry) → `19` §3-4.
- **Yeni tablo AÇILMAYANLAR:** dossier, lead_scores, offers, audit_log — hepsi DERIVED/read-model (anti-bloat).

## 6. Satış motorları (özet zinciri)

| Motor | Tek cümle | Derin doküman |
|---|---|---|
| **Lead Intelligence** | 13-aşamalı deterministik-önce pipeline (discovery→…→dossier→readiness); K3 otonom döngü = cron + `build-lead-dossier`; ham veri asla outreach'e — [13] Outreach Readiness gate (≥2 kanıt + skor≥70 + kanal + suppression + consent) kırmızı çizgi | `08` |
| **Scoring & Qualification** | Tek sayı yerine açıklanabilir 11-boyutlu kart; mevcut V3/Quality ağırlıkları parity-korumalı; qualification deterministik FSM (proposal terfi pain+DM+budget); human override → FeedbackEvent (skoru değiştirmez, öğrenmeyi besler) | `09` |
| **Service & Offer** | İki AYRI kütüphane: Service Library (katalog, uydurma yapısal imkânsız) ↔ Offer Library (runtime `offerArchitect`, saf fonksiyon); `internal`/`clientFacing` şema-düzeyi ayrım (iç fiyat gerekçesi müşteriye asla); 7 tier, varsayılan micro/project | `10` |
| **Outreach (K2+K4)** | 9 aşama; LLM yalnız draft+judge; model minimal paket görür (ham dossier değil); evidence_id grounding runtime'a taşınır; rol açının fayda çerçevesini belirler; Voice Guard (pure-code lint) + cross-family judge → HITL | `11` |
| **Gmail & Follow-up (K1)** | Scope `gmail.send`+`gmail.readonly` (modify/full YASAK); L2 draft→approve(digest-lock)→send; çift-gönderim yapısal imkânsız (3'lü guard); sync 15dk History poll (push V2); follow-up 5-7 **iş günü** (yeni `businessDays.ts`+TR tatil), üç dağınık kural seti tek FSM'e konsolide; stop-on-reply/bounce/opt-out | `12` |
| **Reply Intelligence** | İçerik = güvenilmez DATA; deterministik prefilter ($0, confidence 1.0) → ucuz LLM (~19 sınıf) → confidence gate (≥0.85 auto-öneri / <0.6 insan triage); cevap taslağı asla auto-send; pipeline'a yeni state icat edilmez | `13` |
| **Proposal** | İki kopuk üretici (generator=strateji, builder=belge) silinmeden köprülenir; `proposals` version chain append-only (superseded); fiyat/problem ASLA AI-uydurma; Assumptions/Out-of-scope/Expiry şablon-tabanlı; MVP=PDF/düz-metin | `14` |
| **Memory (K4)** | 5 katman scoped (`preference`/`company`/`contact`/`outreach`/`offer`); izolasyon = SQL filter-before-retrieval **VE** `lead:<id>:` key-prefix (her ikisi); tek düzenleme asla kalıcı kural olmaz (quarantine→occ≥3/HITL→active); decay half-life 30g; supersession (silinmez) | `15` |

## 7. Agent + skill sistemi → `06`, `07`

**Yeni ajan YOK.** 11 rol mevcut 5 iş-ajanına (`sales_rep`/`researcher`/`data_analyst`/`ceo`/`cmo`) + ephemeral judge'a haritalanır; boşluklar **21 yeni/mevcut SKILL** (`agent_skill_grants` ile). Ajanlar serbest-metin konuşmaz — bağ tiplenmiş event+entity. ★MVP = 10 skill (dossier, extract-signals, score-lead✓, match-service✓, generate-outreach, review-outreach, send-gmail, schedule-follow-up, classify-reply, update-pipeline). Aktivasyon 3 kapı: flag → eval-gate → parity-guard; deterministik skiller önce active, Gmail/reply skilleri OAuth+SPF/DKIM/DMARC bitene kadar shadow. Mutlak kural: **deterministik işe LLM koyma** (tarih/dedup/FSM/suppression/skor = pure-code).

## 8. OpenRouter routing (ACİL) → `16`

- **Sorun:** `OPERATION_MODEL_MAP`'teki üç canlı ID de 404 (2026-07-11 iki bağımsız WebFetch ile doğrulandı); fallback/timeout/retry yok; ID dört ayrı yere gömülü.
- **Çözüm:** central `PRESETS` registry; hiçbir yer ham model ID görmez. 6 preset: `agencyos-fast-extract` (qwen3.6-flash) · `research` (gemini-3.1-flash-lite) · `professional` (gpt-5.6-luna→sonnet-5) · `premium-deal` (sonnet-5→terra; **opus-4.8 $5/$25 yalnız explicit escalation + HITL** — "opus ucuz" sentez hatası düzeltildi) · `judge` (cross-family) · `memory` (3 alt-yol). Embeddings OpenRouter'dan DEĞİL (Google `gemini-embedding-001`, mig 042 değişmez).
- **Politika:** `models:[primary,...fallbacks]` self-heal · AbortController timeout · 1 retry · görünür fallback log · price ceiling · `data_collection:deny` (Tier 3-4) · nightly model-health cron (drift proaktif). `callWithOperation` imzası değişmez — sıfır çağıran kırılması.

## 9. Evaluation + maliyet + güvenlik

- **Eval (→ `18`, `17`):** 3 katman — deterministik lint + cross-family LLM-judge + human feedback; golden %100 + birebir parity aktivasyon şartı; benchmark ilkesi "kalite eşiğini geçen EN EKONOMİK model" (premium otomatik seçilmez).
- **Maliyet (→ `22`):** LLM üç senaryoda da önemsiz (Yoğun'da ~$5.22/ay, $20 cap'in %26'sı). **Gerçek risk Google Places** ($60→$1500/ay, bugün HİÇ loglanmıyor) → `tool_cost_logs` (052) ölçüme taşır. Cap'ler değişmez (güvenlik ağı, darboğaz değil). Cost funnel: deterministik→ucuz→research→professional yalnız qualified→premium 1-2/gün.
- **Güvenlik (→ `21`):** 16 tehdit modellendi; en kritikler: e-posta prompt-injection (T2 — içerik yalnız user-veri bloğu, classify≠eylem), yetkisiz/çift gönderim (T5/T6 — digest-lock + idempotency yapısal), cross-lead memory sızıntısı (T7 — mig 050 + namespace, reply-ingest'ten ÖNCE), OAuth token (T4 — Vault/şifreli ayrı tablo, en-dar scope). **HITL pazarlıksız — hiçbir e-posta onaysız gitmez; "X'i onayla, Y'yi gönder" yapısal imkânsız.** KVKK/6563/İYS teknik kapılar hazır; her madde `professional legal review required`.

---

## 10. Paralel geliştirme + MVP + ilk sprint → `24`, `23`, `25`, `FIRST-SPRINT.md`

- **Paralel plan:** contract-gate (Dalga 1 sözleşmeleri donması) → workstream A-H (A=kokpit, B=lead-intel, C=offer/proposal, D=voice, E=Gmail, F=memory, G=routing, H=migration/güvenlik). Kritik yol: **contract-gate → E (Gmail) → D/F (öğrenme E'nin verisiyle) → A tam-yüzey**. Shared contract bitmeden paralel kod başlamaz.
- **MVP tanımı (K1 döngüsü):** BUGÜN kokpiti + dossier + açıklanabilir skor + service/portfolio match + rol-aware taslak + Voice Guard + HITL + Gmail send + suppression + temel follow-up + temel reply-classify + audit + cost tracking. **MVP dışı (bilinçli):** otomatik gönderim, öğrenen Voice DNA (yakalama var, öğrenme V1), aktif hafıza kullanımı, teklif motoru, Pub/Sub push.
- **Sprint planı (≤2 hafta/sprint):** **Sprint 0** = model-routing URGENT fix + Gmail OAuth + contract-gate + flags (mig 046-başlangıç/052). **Sprint 1** = BUGÜN + dossier + taslak + Gmail send (045/047/046-tam). **Sprint 2** = follow-up FSM + reply classify (051). **Sprint 3** = portfolio + offer + proposal (048/049). **Sprint 4** = memory + voice learning (050). OAuth gecikirse: Gmail adımları shadow'da, kokpit+deterministik+portfolio öne çekilir (fallback yol).
- **Başarı kriterleri:** (1) döngü uçtan uca kapanır (dossier→taslak→onay→gönder→thread→follow-up→yanıt-sınıf→sonraki-eylem demo edilebilir); (2) hiçbir e-posta onaysız/suppression-ihlalli gitmez; (3) birincil görev ≤3 adım, yeni route yok; (4) her durum tasarlı; (5) skor parity bozulmadı; (6) edit-delta yakalanıyor; (7) LIFE DB/Görev/Alışkanlık hiç değişmedi; (8) 3 ölü model ID canlı preset'e düştü ve nightly drift cron çalışıyor.

---

## Doküman haritası

`00` araştırma incelemesi · `01` ürün spec · `02` IA · `03` akışlar · `04` domain model ⚑ · `05` event contracts ⚑ · `06` agent registry ⚑ · `07` skill registry ⚑ · `08` lead intelligence · `09` scoring · `10` service/offer · `11` outreach · `12` gmail/follow-up · `13` reply · `14` proposal · `15` memory · `16` routing ⚑ · `17` benchmark · `18` eval · `19` data/worker ⚑ (migration sahibi) · `20` observability · `21` güvenlik · `22` maliyet · `23` MVP/V1/V2 · `24` workstreams · `25` sprint roadmap · `26` acceptance · `27` risk register · `FIRST-SPRINT` · `IMPLEMENTATION-HANDOFF`.

**Etiket disiplini:** doğrulanmamış her iddia kaynak dokümanda `assumption:`/`unverified:`/`[UNKNOWN]` taşır; bu özet onları yumuşatmaz — en kritikleri: Gmail OAuth operatör-bağımlı [BLOKÖR], Places SKU fiyatı doğrulanmadı, `draft_proposal`'ın bugün 500 döndüğü canlı test edilmedi, retention süreleri (24ay/12ay) operatör kararı, TR hukuki maddeler profesyonel inceleme gerektirir.
