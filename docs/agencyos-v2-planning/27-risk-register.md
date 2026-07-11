---
Doküman: 27-risk-register
Dalga: 2 (Motor — risk envanteri; tüm risk-cluster'a referans)
Tarih: 2026-07-11
Durum: Risk register (~29 risk, 7 kategori); 21-security + 24-workstreams + 25-sprint ile senkron
Bağımlılık: 21 (tehdit modeli T1-T16), 23 (faz), 24 (workstream sahipleri), 16 (routing); araştırma 26-risk-register.md
---

# AgencyOS V2 — Risk Register (~29 risk, 7 kategori)

## 0. Çerçeve

Olasılık/Etki: Düşük (D) / Orta (O) / Yüksek (Y). "Sahip" = 24 workstream harfi. "Test" = eval slug veya 26 senaryosu. Azaltma mevcut korumalara referans verir (yeniden-icat YOK). "Tespit" = riskin canlıda görülme yolu.

**En kritik 5 (planlama önceliği):**
1. **X1 Gmail OAuth blokörü** — MVP kapsamını belirler (fabrike edilemez).
2. **M1 stale model IDs** — **ŞU AN AKTİF** (3 ID canlı `/api/v1/models`'de kesin 404 doğrulandı 2026-07-11).
3. **S1 prompt injection** (reply ingest) — mimari kontrol V1 öncesi.
4. **S4 cross-lead memory sızıntısı** — namespace ayrımı V1 öncesi (mevcut mimari boşluk).
5. **L1/L2 KVKK opt-out** — suppression + hukuki inceleme.

---

## A. Mevzuat / Hukuki

| ID | Risk | Ola. | Etki | Azaltma | Tespit | Sahip | Test |
|---|---|---|---|---|---|---|---|
| L1 | KVKK/6563 ihlali (kişisel adrese ön-onaysız outreach) | O | Y | `isFreemail()`→uyum-dikkat; iş-vs-kişisel adres heuristiği; tacir/esnaf iş-adresi varsayılanı; İYS; **professional legal review required** (21 §2 C1) | `audit-compliance` addrClass; kişisel-adres flag | E/Compliance | `eval.compliance.audit_outreach` |
| L2 | İlk itiraza rağmen gönderim (opt-out ihlali) | D | Y | `suppression_list` (mig 047) pre-send gate; `opt_out`/`ret` sınıfı kalıcı durdurur (21 T8) | suppressed→block audit | E | 26 Senaryo 5 |
| L3 | Hukuki kesinlik iddiası (bu plan hukuki tavsiye değil) | O | O | Tüm mevzuat bulguları `professional legal review required` etiketli; kesin ifade yok | doküman etiket denetimi | — | doc review |
| L4 | Gelen 3. taraf e-postasını LLM'e gönderme (KVKK "veri işleyen") | O | O | Veri-minimizasyonu; redaction; provider `data_collection:deny`; professional legal review required (21 C8) | provider-politika audit | E/G | — |

## B. Deliverability / E-posta

| ID | Risk | Ola. | Etki | Azaltma | Tespit | Sahip | Test |
|---|---|---|---|---|---|---|---|
| D1 | SPF/DKIM/DMARC eksikliği→550/spam | O | Y | Gönderim öncesi `audit-deliverability` DNS doğrulama (operatör tek-seferlik); send bu geçene kadar shadow | DNS TXT eksik→issue | E/Compliance | `eval.outreach.audit_deliverability` |
| D2 | Yüksek bounce/complaint→domain reputation çöküşü | D (düşük hacim) | Y | Düşük hacim + HITL + suppression; hard/soft bounce ayrımı | bounce oranı izleme | E | — |
| D3 | Open-tracking pixel'e aşırı güven (yanıltıcı+gizlilik) | O | D | Ana metrik = delivered/replied/positive-reply/meeting/won (opens değil) | metrik tanımı | A/G | — |

## C. Güvenlik

| ID | Risk | Ola. | Etki | Azaltma | Tespit | Sahip | Test |
|---|---|---|---|---|---|---|---|
| S1 | Prompt injection (gelen e-posta/web içeriği) | Y | Y | Dış içerik=VERİ (asla system/tool); lethal-trifecta (`permissions.ts:32-36`); sınıflandırma yalnız etiket, eylem tetiklemez; gizli-metin strip (21 T1/T2) | `hasUntrustedInput=true` span; injection eval | B/E/G | `eval.sales.classify_reply` (fixture) |
| S2 | OAuth/refresh token sızıntısı | D | Y | Şifreli ayrı tablo (Vault); least-privilege `gmail.send`+`readonly`; `redact.ts` token-prefix (21 T4) | token-redaction test; RLS reddi | E/H | `eval.security.token_redaction` |
| S3 | Yetkisiz VEYA duplicate gönderim | D | Y | Digest-lock HITL (`repo.ts:77`); idempotency `outreach_messages.id` + `sent_at` no-op; `markApprovalExecuted` tek-geçiş (21 T5/T6) | onaysız→canExecute bloke; UNIQUE ihlali | E | 26 Senaryo 6 |
| S4 | **Cross-lead memory sızıntısı** | O | Y | **Namespace ZORUNLU (V1 öncesi boşluk kapat):** mig 050 scope + `lead:<id>:` prefix; filter-before-retrieval SQL (21 T7) | scope'suz retrieval derlenemez; sızıntı eval | F/H | 26 Senaryo 7 |
| S5 | Company identity confusion (yanlış şirket) | O | O | Gönderim anahtarı **domain+lead_id** (isim değil); HITL onayda alıcı-domain görünür (21 T-ilişkili) | domain-mismatch flag | E/B | — |
| S6 | RLS bypass / SQLi | D | Y | RLS default-deny+REVOKE (mig 017); view `security_invoker`; `sanitizeWriteBody` (alan-allowlist eksik-açık) (21 T10) | `get_advisors` RLS-lint | H | RLS anon-reddi test |
| S7 | Agent over-permission (excessive agency, OWASP LLM06) | O | Y | Yüksek-risk skill için boş-grant-serbest **kapatılır** (`permissions.ts:18-22`); açık grant zorunlu (21 T15) | grant'sız send→bloke | H/E | grant-matrisi unit |
| S8 | Sensitive log (PII/token loga düşme) | O | O | `redact.ts` maske+kırpma; `run_spans` `redactAttributes` (mig 044:18); token-prefix ekle (21 T11) | redaksiyon unit; span örnekleme | H | `eval.security.log_redaction` |
| S9 | Attachment enjeksiyonu/malware | O | Y | MIME allowlist (pdf/png/jpg); render YOK; çıkarılan-metin=VERİ (21 T3); MVP'de ek işleme kapsam-dışı | allowlist-dışı reddi | E | `eval.outreach.sync_email_thread` |
| S10 | Webhook spoofing (Telegram/Gmail push) | O/D(mevcut) | Y (push) | Telegram secret-token (`route.ts:424-426`); Gmail Pub/Sub push OIDC-doğrulama (kopyalanamaz, V2 ayrı inceleme) (21 T14); MVP=poll | imzasız-webhook reddi | H | Telegram secret-token test |

## D. Model / AI

| ID | Risk | Ola. | Etki | Azaltma | Tespit | Sahip | Test |
|---|---|---|---|---|---|---|---|
| M1 | **Stale/kırık model ID→runtime 404, fallback yok** | **Y (ŞU AN)** | O | `models:[primary,...fallbacks]` self-heal; canlı `/api/v1/models` doğrulama (16 §2: 3 ID kesin 404 teyit); nightly drift-cron — **URGENT Sprint 0** | nightly model-verify; fallback log | G | fallback-self-heal unit |
| M2 | Preview model kaldırma / provider outage | O | O | Stable fallback zorunlu; `provider.allow_fallbacks:true` | fallback.used event | G | — |
| M3 | Hallucination (uydurma hizmet/metrik/portfolyo/fiyat) | O | Y | offerMatcher katalog-kilidi; council `evidence_id` zorunlu; `brain/verify.ts`; fiyat price-rules (AI-uydurmaz); portfolio approved-claim-only | `evidence_id`'siz→reddedilir | B/C/D | `eval.sales.draft_proposal` (fiyat-grounding) |
| M4 | Model maliyet patlaması | D | O | `caps.ts` $20/ay + $0.40/gün lead-intel; premium asla-default (escalation-only); ceiling/max_price; cache (V2) | cost-cap alarm | G | cost-parity unit |
| M5 | Aynı-aile judge (öz-onay) | O | O | Cross-family Tier-5 judge (GPT↔Claude, 16 §3) | judge-model≠writer-family | G | `eval.orchestration.judge_decision` |
| M6 | Model data policy (müşteri verisi provider'da kalır) | O | O | Tier 3-4 `data_collection:deny`; Tier 4 `zdr:true`; embeddings Google-direct (21 T16) | preset-politika audit | G | preset-registry unit |

## E. Veri / Sistem

| ID | Risk | Ola. | Etki | Azaltma | Tespit | Sahip | Test |
|---|---|---|---|---|---|---|---|
| V1 | **Repo migration'ları ≠ canlı DB (manuel-apply drift)** | Y | O | Uygulama öncesi `list_migrations`/`list_tables`; strip-retry (`PGRST204`/`42P01`) toleranslı; her sprint numara doğrula (plan §5) | `list_migrations` diff | H | migration-parity kontrol |
| V2 | Worker idempotency ihlali (duplicate iş) | O | O | Kanonik run/step lease-retry (ADR-001, mig 038); doğal-anahtar idempotency (05 §3) | çift-işlem→key çakışması | H | `eval.pipeline.*` parity |
| V3 | Kişisel veri aşırı saklama | O | O | `retention_until` + data-expiry cron; gövde→özet 24 ay; reply özet-yalnız (21 T13) | retention_until taraması | H/F | data-expiry cron test |
| V4 | Migration numara çakışması (045 3-rapor çakışması) | D | O | Data/Worker (H) **kanonik numaralandırma sahibi** (plan §5); WS bağımsız şema YAPMAZ | numara-sahiplik denetimi | H | doc §5 tutarlılık |

## F. Ürün / Kapsam

| ID | Risk | Ola. | Etki | Azaltma | Tespit | Sahip | Test |
|---|---|---|---|---|---|---|---|
| P1 | Görev/Alışkanlık/Rutin modülünün bozulması | D | Y | Modül izole (LIFE DB); v2 dokunmaz; "koru" kuralı; hiçbir skill LIFE scope talep etmez | LIFE-scope talebi→red | tümü | LIFE-dokunulmazlık denetimi |
| P2 | Dashboard/ekran çoğalması (scope sprawl) | O | O | Yeni ekran son-çare; 4 ekran→tek Bugün recompose; ≤3 adım (rules/os/70) | yeni-route denetimi | A | 26 cockpit ≤3 adım |
| P3 | Notification fatigue (2 yarım bildirim sistemi) | O | D | Tek kanal (Telegram) veya gerçek-sayaca-bağlı zil; birini seç | bildirim-kanal audit | A/H | — |
| P4 | Ölü kod birikimi (dashboard/RightPanel/KanbanBoard) | O | D | Ayrı temizlik görevi; `/icraat-firsatlari` HIDE, `/dashboard`+`/tasks` DELETE (kasıtlı-taslak mı → Cem karar) | orphan-route taraması | A | — |
| P5 | Premium model default kayması / her göreve judge | O | O | premium escalation-only (16 §3); routine-judge ekonomik; deterministik role judge YOK | preset-tier audit | G | preset-registry |

## G. Bağımlılık / Dış

| ID | Risk | Ola. | Etki | Azaltma | Tespit | Sahip | Test |
|---|---|---|---|---|---|---|---|
| X1 | **Gmail OAuth yetkisi alınamaması (blokör)** | O | Y | MVP Gmail'siz-fallback tasarla (deterministik+cockpit+portfolyo); send/reply shadow'da Cem connector onayına kadar (23 §0) | OAuth-durum kontrolü | E | Sprint-0 OAuth checklist |
| X2 | Apollo/Firecrawl/Places API politika/fiyat değişimi | D | O | `tool_cost_logs` (mig 052) — gerçek maliyet Places (loglanmıyordu); sağlayıcı-agnostik | tool-cost izleme | G/H | tool-cost unit |
| X3 | Supply-chain (bağımlılık zafiyeti) | D | O | Resmî `googleapis`; `package-lock` commit; `npm audit` CI; Dependabot/pin (araştırma 23 T18) | npm audit CI | H | dependency-audit |

---

## Kritik-yol risk özeti

- **Sprint 0 kapatır:** M1 (routing fix), X1 (OAuth prereq), S2 (token), V4 (numara-sahiplik), M6 (data-policy).
- **V1 öncesi ZORUNLU kapatılır:** S4 (memory namespace — mig 050), S1 (injection kontrol — reply ingest'ten önce).
- **Her sprint izlenir:** V1 (migration drift — `list_migrations`), P1 (LIFE dokunulmazlık), M3 (hallucination — evidence grounding).

## Açık sorular
- [UNKNOWN] TR hukuku KVKK "veri işleyen" (L4) — professional legal review required.
- [UNKNOWN] SQLi somut PoC (S6) — tam audit bu görev kapsamında değil; parametreli-sorgu deseni hâkim [LIKELY].
- [ASSUMPTION] Olasılık tahminleri orta-güven; gerçek veri (bounce oranı, injection sıklığı) canlıda kalibre edilir.
- [BLOKÖR] X1 Gmail OAuth — planlamayla çözülemez, operatör yetkilendirmesi gerekir.
