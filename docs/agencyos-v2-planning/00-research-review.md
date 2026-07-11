# 00 — Araştırma İncelemesi (Research Review)

> Dalga 1 · load-bearing. Bu doküman 22 araştırma raporunu (`docs/agencyos-v2-research/`) 12 kritere karşı eleştirir, çelişkileri nihai kararlara bağlar, ve raporların repo-iddialarını **gerçek koda karşı** doğrular. Kaynak: onaylı plan `agencyos-v2-ethereal-possum.md` §2/§3/§4/§5 + repo dosya:satır denetimi.
>
> Kural: her mimari iddia bir repo `dosya:satır`'ına veya adlı rapora dayanır; doğrulanmamış varsayım `assumption:` etiketlidir. Nihai kararlar (K1–K4) ezilemez.

---

## 1. Değerlendirme kriterleri (12)

Her rapor şu kriterlere karşı okundu. Verdict tablosu (§2) tek satır gerekçe verir; kritik raporlar için kriter-notları eklenir.

| # | Kriter | Ne sorar |
|---|--------|----------|
| C1 | Kaynak desteği | İddialar birincil kaynağa (repo/vendor doc/akademik) mı, yoksa varsayıma mı dayanıyor? |
| C2 | Güncellik | Model/API/mevzuat bilgisi 2026-07-11 gerçeğiyle uyumlu mu? |
| C3 | Teknik uygulanabilirlik | Next.js 16 + iki-Supabase + Vercel cron gerçeğinde kurulabilir mi? |
| C4 | Kod uyumu | Mevcut şema/servis desenini (never-throw, RLS+REVOKE, additive migration) izliyor mu? |
| C5 | Kullanıcı değeri | Ali Cem'in satış-döngüsü ağrısını (gönder/takip/yanıt) doğrudan azaltır mı? |
| C6 | Bakım maliyeti | Tek operatör bunu sürdürebilir mi? Yeni altyapı/işletim yükü getiriyor mu? |
| C7 | AI maliyeti | Cap'lere ($0.40/gün lead-intel + $20/ay) sığar mı? Premium default'a kaçıyor mu? |
| C8 | Güvenlik | Prompt-injection / lethal-trifecta / SSRF / token sızıntısı yüzeyi açıyor mu? |
| C9 | KVKK / 6563 / İYS | Suppression, consent, opt-out, veri-minimizasyonu düşünülmüş mü? |
| C10 | Tek-kullanıcı uygunluğu | Multi-tenant/enterprise varsayımı mı, tek-operatör gerçeği mi? |
| C11 | Daha basit deterministik alternatif | LLM önerdiği yerde saf kod yeter mi? |
| C12 | MVP-gerekliliği | K1 döngüsü için MVP mi, V1/V2'ye ertelenebilir mi? |

---

## 2. Rapor bazında verdict tablosu

Verdict anlamı: **ACCEPT** (planı olduğu gibi besler) · **ACCEPT-WITH-CHANGE** (kabul, ama plan §3/§5 ile düzeltilir) · **DEFER** (içeriği geçerli ama V1/V2) · **REJECT** (yanlış/eziliyor).

| Rapor | Verdict | Tek satır gerekçe (kritik kriter) |
|-------|---------|-----------------------------------|
| `00-executive-summary` | ACCEPT-WITH-CHANGE | Sentez doğru, ama "MVP Gmail'siz" görüşü K1 ile ezildi (C12); Gmail artık Sprint-0 önkoşulu. |
| `01-current-state-audit` | ACCEPT | Repo envanteri dosya-satır kanıtlı, %100 load-bearing; tüm suit bunun üstüne kurulur (C1/C4). |
| `02-product-and-daily-ux` | ACCEPT | "Tek günlük satış merkezi = recompose, yeni ekran değil" tek-kullanıcı sadeliğiyle uyumlu (C5/C10). |
| `07-portfolio-and-proof-matching` | ACCEPT-WITH-CHANGE | Deterministik skor + approved-only claim doğru; isim çakışması → `portfolio_items`/`case_study` (mig 048) (C4). |
| `08-offer-architecture` | ACCEPT | offerMatcher katalog-kilidi korunur; teklif-seviyesi + rol-farkındalık eklenir (C5/C11). |
| `09-outreach-personalization` | ACCEPT-WITH-CHANGE | Rol-aware açı net-new (K2); Voice DNA edit-delta (K4) MVP değil, `original/final_body` kolonlarıyla V1 (C12). |
| `10-email-deliverability` | DEFER | SPF/DKIM/DMARC + Postmaster operatör/DNS bağımlı, fabrike edilemez; V1 Gmail ile (C3/C9). |
| `11-compliance-and-privacy` | ACCEPT | KVKK/6563/İYS suppression+consent zorunlu; append-only consent doğru (C9). Hukuki kesinlik `assumption:`. |
| `12-gmail-integration` | ACCEPT-WITH-CHANGE | K1 çekirdeği; scope **send+readonly** (§3), `modify`/full YASAK; poll (History API) MVP, push V2 (C8/C12). |
| `13-follow-up-engine` | ACCEPT | State-machine + iş-günü/TR-tatil + stop-on-reply deterministik (C11); `follow_up_sequences` genişletir. |
| `14-reply-intelligence` | ACCEPT | Deterministik prefilter → tek LLM → confidence gate; e-posta içeriği DATA (C8/C11); Gmail'e bağlı (C12→V1). |
| `15-proposal-engine` | ACCEPT-WITH-CHANGE | `proposal_versions` version chain (mig 049); fiyat AI-uydurmaz, price-rules (C7); proposal gate korunur. |
| `16-relationship-memory` | ACCEPT-WITH-CHANGE | `agent_memory` scope genişletme doğru; ama mig numarası 045→**050** (plan §5 kanonik sahibi) (C4). |
| `17-agent-and-skill-architecture` | ACCEPT | Brain v2 + registry aktivasyonu; 11 agent / 21 skill contract; yeni agent yok (C6/C10). |
| `18-openrouter-model-routing` | ACCEPT-WITH-CHANGE | Central registry + `models:[primary,...fallbacks]` self-heal ACİL; katalog build'de re-verify (C2). |
| `20-evaluation-and-analytics` | ACCEPT | 3-katman eval (lint + judge + human); kullanıcı-analytics ≠ system-health ayrımı (C5/C10). |
| `21-data-and-worker-architecture` | ACCEPT-WITH-CHANGE | "Yeni kuyruk kurma, `agent_tasks` = kuyruk" doğru; `ContactChannel`/`follow_up_rules` DEFER (§5'te yok) (C6). |
| `23-security-threat-model` | ACCEPT | Prompt-injection/OAuth/duplicate-send/cross-lead leak/SSRF/suppression-bypass; her risk mitigation+test (C8). |
| `24-cost-scenarios` | ACCEPT-WITH-CHANGE | LLM 3 senaryoda cap altında doğru; ama gerçek risk **Google Places** (loglanmıyor) → `tool_cost_logs` (mig 052) (C7). |
| `25-parallel-workstreams` | ACCEPT | Contract-gate → workstream A-H; shared contract bitmeden paralel kod başlatma (C3/C6). |
| `26-risk-register` | ACCEPT | ~29 risk; top-5 (Gmail OAuth / stale model / injection / memory leak / KVKK) plan §27 ile hizalı (C8/C9). |
| `RESEARCH-SYNTHESIS` | ACCEPT-WITH-CHANGE | Ana karar belgesi; iki hata düzeltildi: (a) "MVP Gmail'siz" K1 ile ezildi, (b) "opus-4.8 ucuz" → pahalı (§3). |

### Kritik raporların kriter-notları

- **18-openrouter-model-routing (C2 güncellik):** En yüksek aciliyet. Canlı router (`src/lib/openrouter.ts:11-36` `OPERATION_MODEL_MAP`) light `gemini-2.5-flash-lite` / medium `claude-haiku-4-5` / heavy `deepseek-v4-pro` — plan §2'ye göre üçü de 2026-07-11'de superseded/bozuk, fallback/timeout/retry YOK. Refactor yüzeyi küçük (tek dosya), değer yüksek. Katalog build'de OpenRouter `/api/v1/models` ile re-verify edilmeli (C2 drift riski kalıcı).
- **21-data-and-worker (C6 bakım):** Tek en değerli mimari karar — yeni kuyruk motoru KURULMAZ; `agent_tasks` + lease/retry (mig 038) zaten Postgres-as-queue. `ContactChannel` (çok-kanal) ve `follow_up_rules` (DB'de state-machine config) plan §5 kanonik migration listesinde YOK → DEFER (V1). MVP `contacts` (mig 045) + `follow_up_sequences` additive ile yürür.
- **12-gmail-integration (C8/C12):** K1 ile MVP çekirdeği oldu. Scope tartışması (`compose+readonly` ↔ `send-only` ↔ `modify`) → **send + readonly** (§3): gönderim + yanıt-okuma follow-up için gerekli; `modify`/full erişim reddedildi (lethal-trifecta yüzeyini küçültür). OAuth = fabrike edilemez tek blokör (Sprint-0 önkoşulu).
- **16-relationship-memory (C4 kod uyumu):** İçerik güçlü (filter-before-retrieval, supersession, decay). Tek düzeltme: raporun önerdiği `045_relationship_memory_scope.sql` numarası plan §5 ile çakışıyor → memory scope migration **050**; `045` = `contacts`. `scope_id` soft-ref kararı (`leads` vs `person_leads` iki ayrı tablo) mevcut `lead_service_matches.lead_id` FK-siz deseniyle (mig 033:67) tutarlı.

---

## 3. Çelişkiler → Nihai Kararlar (plan §3 kopyası + genişletme)

| Konu | Çelişki (rapor A ↔ rapor B) | Nihai karar | Neden / etkilenen doküman |
|------|------------------------------|-------------|----------------------------|
| Gmail MVP'de mi? | 25 "evet" ↔ 00/17/23/synthesis "hayır" | **Evet (K1)** — OAuth Sprint-0 önkoşulu, HITL zorunlu | Kullanıcı isteği araştırmayı ezer; ama HITL+suppression+opt-out pazarlıksız. → `12`, `FIRST-SPRINT`, `23`. |
| Gmail scope | compose+readonly ↔ send-only ↔ modify | **send + readonly** | Gönderim + yanıt-okuma (follow-up) gerekli; `modify`/full trifecta yüzeyi. → `12`, `21-security`. |
| Sync poll ↔ push | 12 poll ↔ 21 push (Pub/Sub) | **MVP poll** (History API, 15dk cron); push V2 | Vercel cron sub-dakika veremez; push yalnız gerçek-zaman yanıt için gerekir, MVP değil. → `12`, `19-data-worker`. |
| Heavy/premium model | sonnet-5 ↔ opus-4.8 | **professional=sonnet-5**, premium-deal escalation=opus-4.8 (yalnız yüksek-değer + HITL) | Premium her lead'de çalışmaz; cost funnel. → `16-routing`, `17-benchmark`, `22-cost`. |
| opus-4.8 ucuz mu? | synthesis "ucuz" ↔ 18/24 "$5/$25" | **Pahalı** — synthesis hatası düzeltildi | opus-4.8 yalnız explicit escalation; default değil. → `16-routing`, `22-cost`. |
| Memory izolasyon | scope kolonları ↔ key namespace | **Her ikisi** (defense-in-depth): `agent_memory` scope kolonları + `lead:<id>:` key prefix | Tek kötü tur hafızayı zehirlemesin; filter-before-retrieval SQL'de zorunlu. → `04-domain`, `15-memory`. |
| 045 migration çakışması | 3 rapor (07/16/21) aynı numarayı istiyor | **Data/Worker dokümanı (`19`) kanonik numaralandırma sahibi** (§5: 045-053) | Tek kaynak, çakışma yok; hepsi additive, App DB only. → `04-domain`, `19-data-worker`. |
| Portfolio isim çakışması | "portföy" zaten emlak stoğu ↔ Ali Cem'in işleri | Yeni entity `portfolio_items`/`case_study`; emlak "portföy"ünden AYRI isim | Anlam kirlenmesi önlenir. → `07`, `04-domain`. |
| Contact vs ContactChannel | 21 çok-kanal tablo ↔ plan tek `contacts` | **MVP tek `contacts`+rol** (mig 045); `contact_channels` DEFER (V1) | Tek operatör için çok-kanal MVP-fazlası; `leads.email`/`person_leads` köprüsü yeter. → `04-domain`. |
| follow_up_rules DB config | 21 DB state-machine ↔ mevcut kod-sabit | **MVP kod-sabit + `follow_up_sequences` additive**; `follow_up_rules` tablosu DEFER | §5'te tablo yok; deterministik state-transition koddan yürür. → `12-followup`, `19`. |
| Reply retention 24 ay | 21 "24 ay" ↔ operatör | `assumption:` — iş gereksinimi mi yasal tavan mı belirsiz; operatör kararı, `retention_until` config'lenebilir | KVKK veri-minimizasyonu; gövde 24 ay sonra özete indirgenir. → `04-domain`, `21-security`. |

---

## 4. Repo-doğrulama sonuçları (rapor iddiaları vs gerçek kod)

Araştırma raporlarının repo-iddiaları **okunan gerçek koda** karşı doğrulandı. CONFIRMED = kod iddiayı destekliyor; CORRECTED = plan/kod iddiayı düzeltiyor.

| # | Rapor iddiası | Sonuç | Kanıt (dosya:satır) |
|---|---------------|-------|---------------------|
| 1 | `coldEmail.ts` "Ali Cem Bozma" persona seed; klişe-yasağı | CONFIRMED | `coldEmail.ts:53` persona; `:62-64` yasak klişe listesi; `:66` ≥1 somut gözlem zorunlu. |
| 2 | LLM link/imza YAZMAZ; imza deterministik settings'ten | CONFIRMED | `coldEmail.ts:70` "ASLA link/URL/imza yazma"; `buildSignatureBlock :159-172`; footer `:180-195`. |
| 3 | `ColdEmailLead` tipinde contact kişi/rol alanı YOK → rol-aware net-new (K2) | CONFIRMED | `coldEmail.ts:7-24` — yalnız `business_name`/`sector`/sinyaller; person/role/title alanı yok. |
| 4 | Opt-out link yok; "ret yazarak yanıtla" (manuel-gönder modeli) | CONFIRMED | `coldEmail.ts:193` "ret yazarak yanıtlamanız yeterlidir" — RFC 8058 one-click YOK (net-new). |
| 5 | customerCategory 7 kategori; AI yalnız `otomasyon_fit` | CONFIRMED | `customerCategory.ts:51-59` (7 CATEGORY_DISPLAY); `:100-103` AI kapısı; başlık yorumu `:4`. |
| 6 | customerCategory deterministik, LLM yok | CONFIRMED | `customerCategory.ts:2` "Deterministik, LLM yok"; `deriveCustomerCategory` saf sıralı if-zinciri `:61-107`. |
| 7 | leadScoringV3 deterministik, 5 alt-skor | CONFIRMED | `leadScoringV3.ts:248-254` evidence/fit/urgency/money/contactability ağırlıklı; LLM çağrısı yok. |
| 8 | `isFreemail` uyum sinyali (kurumsal alan yok = hafif risk) | CONFIRMED | `leadScoringV3.ts:56-62` FREEMAIL_DOMAINS; risk +6 `:76-78`. |
| 9 | Hot-lead route gate skora bağlı | CONFIRMED | `leadScoringV3.ts:101-106` `routeForScore` (≥75 manual_hyper, ≥60 sequence, ≥45 nurture, else skip). |
| 10 | `leads` = birleşik firma; ayrı `companies` tablosu YOK | CONFIRMED | `mig 001:7-30` `leads` core; `types.ts:73-201` tek `Lead`; ayrı company tablosu yok. |
| 11 | `LeadStatus` 6 aşama + waiting/archived | CONFIRMED | `types.ts:5-14` new→…→converted/lost + waiting; (`archived`/`dismissed` mig 026). |
| 12 | `Proposal` tipi in-memory, version chain YOK (stateless) | CONFIRMED | `types.ts:314-332` app-level interface; `proposal_versions` tablosu yok → net-new (mig 049). |
| 13 | `person_leads` `leads`'ten AYRI (Apollo) | CONFIRMED | Migration glob `027_person_leads.sql` ayrı tablo; `types.ts` tek `Lead` — köprü net-new (contacts, mig 045). |
| 14 | `agent_memory` scope'suz (yalnız key/content) | CONFIRMED | `mig 044:34-48` — `memory_key`/`content`/`status`/`confidence`; `scope_type`/`layer`/`sensitivity` YOK. |
| 15 | `approval_requests.data_sensitivity` enum zaten var (memory reuse etmeli) | CONFIRMED | `mig 043:27-28` `('public','internal','confidential','secret')` — mig 050 memory bunu birebir kullanacak. |
| 16 | Lead Intelligence v2 tabloları mevcut (evidence/assessment/matches/feedback) | CONFIRMED | `mig 033:24-89` `lead_evidence`/`lead_assessments`/`lead_service_matches`/`lead_match_feedback`. |
| 17 | `lead_service_matches.lead_id` bilerek FK-siz (kod validate eder) | CONFIRMED | `mig 033:67` "FK değil: kod validate eder" — memory `scope_id` soft-ref bu deseni tekrarlar. |
| 18 | Migration 003 kasıtlı boşluk; runner yok, elle SQL | CONFIRMED | Glob: `002` → `004` (003 yok); `mig 033:8` "SQL Editor'da elle uygulanır". |
| 19 | Canlı DB hiç `045+` migration'ı yok (temiz zemin) | CONFIRMED | Glob son dosya `044_trace_memory_governance.sql`; 045-053 net-new. |
| 20 | RLS default-deny + REVOKE deseni (service-role bypass) | CONFIRMED | `mig 043:45-46`, `mig 044:30-31/53-54`, `mig 033:91-106` — tüm yeni tablo bu deseni izler. |
| 21 | Report 21 `ContactChannel` ayrı tablo gerekli | CORRECTED | Plan §5 mig 045 yalnız `contacts`+rol/unvan; çok-kanal MVP-fazlası → DEFER. `leads.email` (`mig 001:15`) tekil kanal yeter. |
| 22 | Report 16 memory scope migration = `045` | CORRECTED | Plan §5: `045`=contacts, memory scope=**050**; `19-data-worker` kanonik numara sahibi. |
| 23 | Report 21 `follow_up_rules` DB tablosu | CORRECTED | Plan §5'te yok; MVP `follow_up_sequences` (mig 010) additive `state`/`reason` + kod-sabit kural → DEFER V1. |
| 24 | Synthesis "opus-4.8 ucuz" | CORRECTED | Plan §3: pahalı ($5/$25); yalnız premium-deal escalation. |
| 25 | Report 21/16 "`agent_memory`'ye hiçbir TS dosyası yazmıyor" | UNVERIFIED (rapor-kaynaklı) | `assumption:` — bu incelemede repo-geneli grep çalıştırılmadı; rapor 16:11 "grep doğrulandı" der, uygulamada teyit edilmeli. |

**Özet:** 20 iddia CONFIRMED, 4 CORRECTED (hepsi plan §3/§5 ile), 1 rapor-kaynaklı doğrulanamadı. Hiçbir rapor iddiası "gerçek kodla çelişip düzeltilmeden bırakıldı" durumunda değil.

---

## 5. Eksik 6 rapor (03/04/05/06/19/22) — içerik nerede yeniden inşa edildi

Araştırma seti 28 numaradan 22'sini üretti; 6 numara hiç yazılmadı. İçerikleri diğer raporlara/dokümanlara dağılmış; planlama suitinde şöyle yeniden inşa edilir:

| Eksik | Konu | İçerik nereden yeniden inşa edilir |
|-------|------|-------------------------------------|
| 03 | ICP tanımı | `01-current-state-audit` §4 (sektör/city×sector olgun motor) + K2 (B2B-tech rol modeli) → planlama `09-scoring-and-qualification` + `08-lead-intelligence-engine`. |
| 04 | Lead Discovery | `01` §4 (Places/city×sector/Apollo üç motor) → planlama `08-lead-intelligence-engine`. |
| 05 | Scoring | Gerçek kod `leadScoringV3.ts` (5 alt-skor) + `highQualityLeadEngine` → planlama `09-scoring-and-qualification` (açıklanabilir skor kartı). |
| 06 | Service-Match | `08-offer-architecture` + gerçek kod `customerCategory.ts`/`offerMatcher` (katalog-kilidi) → planlama `10-service-and-offer-engine`. |
| 19 | Benchmark | `18-openrouter-model-routing` (kalite-eşiği modeli) → planlama `17-model-benchmark-plan` (6 görev, en ekonomik geçen). |
| 22 | Observability | `20-evaluation-and-analytics` + `21-data-worker` (`run_spans`/trace) → planlama `20-observability-and-analytics` (user-analytics vs system-health ayrı). |

Not: 6 eksik raporun hiçbiri **net-new bilinmeyen** getirmez — hepsi ya olgun mevcut motor (03/04/05/06) ya da yazılmış komşu rapor (19/22) tarafından kapsanır. Planlama suiti bu boşlukları gerçek kod + K1-K4 kararlarıyla doldurur.

---

## 6. Genel yargı

- **Araştırma kalitesi yüksek, aksiyonu net:** raporların ~%80'i ACCEPT / ACCEPT-WITH-CHANGE; hiçbiri tam REJECT değil (yalnız synthesis'in 2 iddiası + "MVP Gmail'siz" görüşü kullanıcı kararıyla ezildi).
- **En yüksek aciliyet (kod-değeri):** model routing self-heal (`18`) — küçük yüzey, sessiz-404 riskini kapatır.
- **En büyük blokör:** Gmail OAuth (`12`) — fabrike edilemez, Sprint-0 önkoşulu.
- **En değerli mimari sadelik:** yeni kuyruk kurma (`21`) — `agent_tasks` yeniden kullanılır, bakım yükü sıfır.
- **Değişmez raylar:** offer-matcher katalog-kilidi, council evidence_id zorunluluğu, digest-locked HITL, lethal-trifecta guard, RLS+REVOKE, cost cap, never-throw — hepsi korunur ve genişletilir.
- **Tek-kullanıcı disiplini:** çok-kanal (`contact_channels`), DB-state-machine config (`follow_up_rules`), Pub/Sub push — hepsi MVP'den DEFER; enterprise şişkinliği reddedildi.
