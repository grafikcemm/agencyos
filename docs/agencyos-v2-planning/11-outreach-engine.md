---
Doküman: 11-outreach-engine
Dalga: 2 (Motorlar — ⚑ K2 rol-aware + K4 Voice DNA taşıyıcısı)
Tarih: 2026-07-11
Durum: Motor tasarımı (Dalga 1 sözleşmelerine referansla)
Bağımlılık: 04-domain-model.md (MessageDraft/Contact/Role/OutreachStrategy), 05-event-contracts.md (outreach.*), 06-agent-registry.md (§3.4 Outreach, §3.5 Outreach Reviewer), 07-skill-registry.md (§2.8 generate-outreach, §2.9 review-outreach), 16-openrouter-routing.md (agencyos-professional/premium-deal/judge)
Kaynak: onaylı plan K2 (rol modeli) + K4 (Voice DNA edit-delta) + §4 (evidence-pack→strateji→draft→voice-guard→judge→HITL) · research 09-outreach-personalization · repo coldEmail.ts / coldEmailTemplates.ts / outreach/email.ts
---

# AgencyOS V2 — Outreach Engine (rol-aware personalizasyon + Voice DNA)

## 0. Tek cümle + mevcut gerçek

Outreach katmanı bugün **klişe-yasağını ve kanıt-dilini doğru kurmuş** (`coldEmail.ts:51-77` persona + yasak-liste; imza/footer deterministik `:159-195`) ama üç yapısal boşluğu var: (a) **rol yok** — `ColdEmailLead` tipinde kişi/rol alanı hiç yok (`coldEmail.ts:7-24`), her taslak firmaya yazılır, karar-vericiye değil; (b) **öğrenme yok** — operatörün gönderirken yaptığı düzeltme hiçbir yerde yakalanmıyor (`markMessageSent` yalnız `status='sent'` yazar, `email.ts:11-40`), sistem her seferinde sıfırdan aynı statik kurallarla üretir; (c) **evidence_id grounding runtime'da yok** — kanıt-bağı yalnız council'de (Lead Intel v2, `lead_evidence` mig 033) var, cold-email üretim yolunda iddia↔kanıt zorlaması yapılmıyor.

Bu doküman bu üç boşluğu, **yeni alt-sistem icat etmeden**, mevcut persona + template + governance primitiflerini yeniden kullanarak kapatan motoru tanımlar. Kod yazmaz; hedef mimariyi kilitler.

## 1. Boru hattı (9 aşama, deterministik-önce)

Her lead için, "Bugün" kokpitinden veya `lead.qualified` event'inden (05 §Lead) tetiklenen tek yönlü akış. Her aşama tiplenmiş çıktı üretir; aşamalar arası bağ **event + entity**, ajan-sohbeti değil (06 §2).

| # | Aşama | Tür | Sahibi (06) | Çıktı |
|---|-------|-----|-------------|-------|
| 1 | **Evidence Pack** | deterministik | Lead Intelligence | `{ companySummary, evidence[], signals[], roleSignals }` — dossier read-model (04 LeadDossier) |
| 2 | **Personalization Strategy** | deterministik seçim | Service & Offer | `{ role, angle, serviceMatch, portfolioProof?, channel }` (K2 rol-aware) |
| 3 | **Channel Selection** | deterministik | Pipeline/Service | `channel` (`channelMatrix.ts` CHANNEL_PRIORITY × CustomerType) |
| 4 | **Draft** | LLM | Outreach (`sales_rep`) | `{ subject, primaryBody, originalBody, evidenceIds[] }` |
| 5 | **Deterministic Validation** | pure-code lint | Outreach Reviewer | `{ structureOk, footerOk, linkPolicyOk, banlist[] }` |
| 6 | **Voice Guard** | pure-code | Outreach Reviewer | `{ voiceScore, clicheHits[], lengthOk }` |
| 7 | **Independent Judge** | LLM cross-family | Outreach Reviewer | `{ verdict: pass\|revise\|block, groundingOk, issues[] }` |
| 8 | **HITL Approval** | operatör | — | `approval_requests` digest-lock (mig 043) |
| 9 | **Gmail Draft/Send** | araç çağrısı | Email Ops | `email.sent` (12-gmail-and-followup-engine.md) |

**Kilit sıra kuralı:** LLM yalnız 4 ve 7'de çalışır. 1-3 ve 5-6 saf koddur (halüsinasyon yüzeyi minimal). Aşama 8 pazarlıksız (K1 L2: ben onaylarım → gönderilir); aşama 9 ayrı dokümanın (12) sorumluluğu.

## 2. K2 — rol-aware açı (net-new: bugün rol yok)

Plan K2: personalizasyon **rol-farkındalıklı** olur. Karar-verici rolüne göre açı ve fayda çerçevesi değişir:

| Rol (`contacts.role`, mig 045) | Ana açı | Fayda çerçevesi | Örnek dil |
|--------------------------------|---------|-----------------|-----------|
| `owner` (işletme sahibi) | **büyüme / tasarım** | daha çok müşteri, güçlü marka yüzü | "ilk güven sinyalini güçlendirme", "satışa dönüşen görünüm" |
| `cto` (teknik) | **teknik verimlilik** | hız, tekrarlanabilirlik, iş yükü azaltma | "kreatif üretim hattını hızlandırma", "ekip kurmadan kapasite" |
| `cfo` (mali) | **maliyet** | tam-zamanlı istihdam vs esnek kapasite arbitrajı | "sabit maliyet yerine esnek dış kapasite" |
| `marketing` (pazarlama dir.) | **kampanya** | kampanya hızı, varyasyon, lansman kreatifi | "kampanya temposunda kreatif kaçağını kapatma" |
| `ops`/`other`/null | firma-genel (güvenli varsayılan) | mini-audit çerçevesi | mevcut `mini_audit` açısı |

**Uygulama (mevcut yapıya):**
- **Veri temeli net-new:** rol `contacts.role` (mig 045) alanından gelir; `leads`(firma) satırında rol yoktur. Rol yoksa (contact henüz zenginleştirilmemiş) → `owner`/firma-genel varsayılanına düş (asla uydurma unvan).
- **Sinyal kaynağı:** `extract-signals` skill'i (07 §2.3) dossier'dan `roleSignals: { owner?, cto?, cfo?, marketing? }` üretir; Outreach bu bloğu tüketir. Rol-farkındalık **burada başlar**, Outreach yalnız uygular.
- **Template köprüsü:** mevcut 4 açı (`coldEmailTemplates.ts`: `mini_audit`/`launch`/`hiring`/`before_after`) rol ile **çelişmez, birleşir**. `selectColdEmailTemplate` (`:79-84`) sinyalden açıyı seçer; rol o açının **fayda çerçevesini** belirler. Örn. `hiring` açısı + `cfo` rolü → maliyet-arbitraj dili; `hiring` + `cto` rolü → kapasite-verimlilik dili. Yeni template gerekmez; sistem promptuna rol-çerçevesi bir satır olarak eklenir.
- **Sistem promptu değişimi:** `buildColdEmailSystemPrompt()` (`:51-77`) mevcut kural bloğu **korunur**; sonuna rol-çerçeve talimatı eklenir (statik, birkaç satır). `assumption:` çok-kanal kişi tablosu (`contact_channels`) MVP'den ertelendi (04 Contact notu) → tek rol/kişi yeter.

## 3. Model'e giden minimal bağlam (ham araştırma DEĞİL)

Kritik anti-desen: tüm dossier'ı / ham HTML'i / tüm council çıktısını LLM'e vermek. Bu hem maliyet hem halüsinasyon hem context-pollution artırır (06 §2). Model **yalnız** şu sıkıştırılmış paketi görür:

```
1. companySummary        : ≤2 cümle firma özeti (ad, sektör, konum)
2. topEvidence           : en güçlü 2-3 kanıt parçası (her biri evidence_id + tek-cümle özet)
3. oneNeed               : tek belirgin ihtiyaç (pain_signal / signal)
4. oneService            : tek önerilen hizmet (offerMatcher slug — katalogdan, uydurma yok)
5. onePortfolioProof     : varsa tek gerçek portföy kanıtı (portfolio_claims approved-only, mig 048)
6. channel + role        : seçilmiş kanal + karar-verici rolü (K2)
7. voiceDna              : aktif voice_pattern'ler (en fazla 5-8, confidence-ağırlıklı, K4)
8. bannedPhrases         : klişe/yasak-liste (mevcut + genişletilmiş, research 09 §5)
9. ctaPolicy             : kanal-uygun tek yumuşak CTA kuralı
10. priorContact         : son temas özeti (varsa — takip ise "farklı açı" sinyali)
```

- **Ham araştırma yasak:** LLM PSI raporu, tam HTML, screenshot payload'ı, tüm `lead_evidence` satırlarını görmez — yalnız `topEvidence`'ın seçilmiş özetlerini. Bu, `buildColdEmailUserPrompt` (`:79-117`) deseninin genişletilmiş halidir: bugün de yalnız seçili alanlar geçiliyor (ham veri değil), rol + voiceDna + portfolioProof eklenir.
- **Preset:** `agencyos-professional` (16 §3, primary `gpt-5.6-luna` → fallback `claude-sonnet-5`); yüksek-değer lead (A-tier, çok-sinyalli) → `agencyos-premium-deal` yalnız **explicit escalation** (opus-4.8 default DEĞİL, plan §3). Preset ID hardcode edilmez.
- **Cost funnel:** professional yalnız qualified lead'de çalışır (07 §3); premium yalnız 1-2 escalation/gün. Ham-araştırma-göndermeme kararı token maliyetini de düşürür.

## 4. Çıktı sözleşmesi (yapılandırılmış)

`generate-outreach` (07 §2.8) çıktısı tiplenmiş; serbest metin bloğu değil:

```ts
interface OutreachDraftResult {
  subjectPrimary: string          // ana konu (≤50 karakter, coldEmail.ts kuralı)
  subjectAlternatives: string[]   // 1-2 alternatif konu (operatör seçer)
  primaryBody: string             // ana gövde (60-120 kelime)
  shortAlternative?: string       // kanal-kısa varyant (WA/IG için)
  followUpAngle: string           // sonraki takip için "farklı açı" ipucu (tekrar önleme)
  evidenceRefs: string[]          // KULLANILAN evidence_id'ler (grounding, §5)
  claimsUsed: { claim: string; evidenceId: string }[]  // her iddia → kanıt eşlemesi
  confidence: number              // 0-1 (kanıt-yeterliliği)
  reviewNotes: string[]           // judge/voice-guard'a not (opsiyonel)
}
```

- **`originalBody` ayrımı:** LLM'in ürettiği ham gövde `outreach_messages.original_body` (mig 046) olarak saklanır; operatör düzenlerse `final_body` yazılır → edit-delta (K4, §6). İmza + İYS/KVKK footer bu ikisine de **deterministik** eklenir (`buildSignatureBlock`/`buildComplianceFooter`, LLM yazmaz).
- **Parse:** mevcut `parseColdEmailOutput` (`:124-156`) JSON→regex-fallback deseni genişletilir (subject alternatifleri + evidenceRefs alanlarını da parse eder); bozuk çıktıda `null` → route 502, taslak yaratılmaz.
- **Event:** başarılı taslak → `outreach.drafted` (05 §Outreach; `original_body_ref` gövde run_spans'a yazılmaz, tablo referansı taşınır — privacy `confidential`).

## 5. evidence_id grounding'i council'den runtime'a taşı

Bugün her-iddia-kanıta-bağlı disiplini yalnız Lead Intel v2 council'inde canlı; cold-email üretim yolunda **yok** — LLM "puanınız düşük olmalı" gibi kanıtsız iddia yazabilir (mevcut yasak yalnız prompt-seviyesi, yapısal değil). Değişiklik:

- **Runtime grounding:** `claimsUsed[]` çıktısı zorlanır — her somut iddia (Google puanı, web-yokluğu, reklam/işe-alım sinyali) bir `evidenceId`'ye bağlı olmalı. Kanıtsız iddia içeren gövde **review-outreach** (07 §2.9) tarafından `block` edilir (`brain/verify.ts` "evidence_id'siz bulgu reddedilir" deseni, 06 §3.5).
- **Kaynak:** `topEvidence`'daki her parça zaten `lead_evidence` (mig 033) `evidence_id`'li geliyor; runtime yalnız "gövdedeki iddia bu id'lerden birine dayanıyor mu" kontrolünü ekler. Bu deterministik bir eşleme (iddia-cümlesi ∩ kanıt-özeti), LLM'e ikinci tur soru sorulmaz.
- **Sonuç:** research 09 §4/§5'in "kanıtsız %/ROI yasak" kuralı prompt-tavsiyesinden **yapısal kapıya** yükselir.

## 6. K4 — Voice DNA (persona seed + edit-delta öğrenme)

Plan K4: mevcut persona **seed**; operatörün düzenleme farkı yakalanır → governance quarantine → onaylı `voice_pattern` memory. Corpus bootstrap YOK.

**5 katmanlı döngü (research 09 §2, mevcut primitifleri yeniden kullanır):**

| Katman | Ne | AgencyOS karşılığı |
|--------|-----|--------------------|
| Seed | başlangıç sesi | `coldEmail.ts:51-77` persona + `personaContext.ts` (mevcut) |
| Yakala | taslak vs gönderilen | `outreach_messages.original_body` vs `final_body` (mig 046) |
| Diff | fark çıkarımı | **deterministik** (kelime-delta, silinen/eklenen cümle, klişe-regex) — LLM değil |
| Terfi | quarantine→active | `memory/governance.ts` (mevcut: occurrence≥3 VEYA operatör onayı) |
| Geri-besle | prompt'a ekle | `formatMemoriesForPrompt` deseni (mevcut) → sistem promptuna "ÖĞRENİLEN TERCİHLER" bloğu |

- **Yakalama noktası (research 09 §7 açık sorusu çözümü):** operatör taslağı düzenleyip "gönderildi" işaretlediğinde `final_body` yazılır. Düzenlemediyse `final_body = original_body` (sıfır-maliyet sinyal: "bu taslak aynen onaylandı" = güçlü pozitif örnek). `assumption:` bu, minimal bir UI adımı gerektirir (düzenle-textarea + onay); bugün kopyala-yapıştır akışı var (research 09 §1). MVP'de Gmail L2 akışı (12) bu düzenleme yüzeyini zaten getirir.
- **Diff deterministik:** LLM'e sorulmaz — kelime-sayısı deltası, silinen/eklenen cümle, klişe-liste regex tarama. Çıktı sayılabilir küçük sözlük ("CTA hep kısaltılıyor", "'harika' hep siliniyor", "4→3 paragraf").
- **Depolama:** `agent_memory` (mig 044+050) `memory_type='voice_pattern'`, `scope_type='global'` (Ali Cem'in genel sesi — lead'e bağlı değil), `layer='preference'`. Yeni tablo yok.
- **Governance:** yeni voice-pattern **quarantine**'a yazılır (inert); `active`'e yalnız occurrence≥3 veya operatör onayı ile geçer (06 §3.9 Relationship Memory ile aynı governance). Tek kötü düzenleme sesi zehirlemez.
- **Geri-besleme:** yalnız `active` + confidence-ağırlıklı en fazla 5-8 pattern sistem promptuna eklenir (`formatMemoriesForPrompt` birebir). Kalıcı prompt şişmesi yok.
- **Preset:** `agencyos-memory` (16 §3, extract `qwen3.6-flash`); diff deterministik olduğundan LLM yalnız opsiyonel konsolidasyonda.

## 7. Deterministik doğrulama + Voice Guard (aşama 5-6, LLM'siz)

Judge'dan önce iki saf-kod kapısı — ucuz, hızlı, deterministik:

- **Yapı kontrolü:** 5-parça iskeleti var mı (gözlem cümlesi + CTA cümlesi) — research 09 §4; deterministik heuristik/regex, LLM'e tekrar sorulmaz.
- **Footer/link politikası:** imza + İYS/KVKK footer **kod tarafında** eklenir; gövdede LLM'in yazdığı link/URL/telefon **yasak** (`coldEmail.ts:70` kuralı) — regex ile taranır, ihlal → `revise`.
- **Voice Guard (klişe lint):** yasak-liste (mevcut `:62-63` + research 09 §5 genişletilmiş: sahte-övgü, manipülatif-aciliyet, TR AI-klişe "dönüşüm yolculuğu"/"potansiyelinizi ortaya çıkaralım") regex taraması; uzunluk (60-120 kelime) kontrolü; placeholder (`[isim]`) kontrolü.

Bu kapılar geçmeden judge (aşama 7) çalışmaz — pahalı LLM yalnız temiz taslakta harcanır (cost funnel).

## 8. Bağımsız judge (aşama 7, cross-family)

- **Preset:** `agencyos-judge` cross-family (16 §3.5): writer GPT ise judge Claude; öz-yanlılığı keser. `agencyos-premium-judge` yalnız Tier 3-4 çıktı (yüksek-değer outreach); rutin için `agencyos-routine-judge` ekonomik.
- **Çıktı:** `{ verdict: pass|revise|block, groundingOk, voiceScore, issues[] }` (06 §3.5). `evidence_id`'siz bulgu reddedilir; belirsizlik → `revise` (güvenli).
- **Karar akışı:** `pass` → HITL onayına; `revise` → tek yeniden-üretim turu (aynı minimal bağlam + judge notu); `block` → operatöre gösterilir, otomatik gönderim yok. `revise` sonrası hâlâ başarısız → operatöre elle-düzelt olarak sunulur.
- **Eval:** `eval.outreach.review` + `eval.orchestration.judge_decision` (mevcut, 07 §2.9).

## 9. HITL onay + gönderim sınırı (aşama 8-9)

- **Taslak ≠ gönderim:** Outreach yalnız `outreach:write` (DRAFT satırı) üretir; teslimat **Email Ops**'un ayrı adımıdır (06 §3.6). Bu ayrım lethal-trifecta guard tarafından **zorunlu kılınır** (06 §5): confidential-lead-read + external-send tek adımda olamaz.
- **Onay:** `outreach.approved` (05 §Outreach) yalnız `approval_requests` digest-lock ile (`approved_digest === action_digest`, `repo.ts:77`). "X'i onayla, Y'yi gönder" yapısal imkânsız. Günlük taslak cap (`ai/caps.ts` deseni) spam-drafts önler.
- **Gönderim:** aşama 9 = `send-gmail` (12 dokümanı). Ön-koşul: `audit-compliance` `ok:true` (footer + suppression) + `audit-deliverability` geçmiş + suppression'da değil.

## 10. Kanal politikası (research 09 §3 + channelMatrix genişletme)

`channelMatrix.ts` `CHANNEL_CONFIG` zaten kanal-başı ton + günlük-cap tanımlı; MVP genişlemeleri düşük-maliyet:
- **Klişe-liste genişletme** (research 09 §5): 3 madde (`coldEmail.ts` sistem promptuna) — kod-davranış değişmez.
- **`contact_form` kanalı** (V1): e-postaya yakın, daha resmi; `channelMatrix.ts` ekleme.
- **LinkedIn alt-tipleri** (V1): connect/first_dm/inmail uzunluk farkı belgelenir.
- **`referral` kanalı** (V2): sıcak-giriş, ayrı sistem promptu.
- **Otomasyon YOK:** LinkedIn/IG otomatik gönderim kasıtlı yok (ban + KVKK, `channelMatrix.ts:1-3`); tüm kanallar draft + operatör-gönderim (yalnız e-posta Gmail L2 ile yarı-otomatik, 12).

## 11. Hata & durum davranışı (her durum tasarlı)

| Durum | Davranış |
|-------|----------|
| Kanıt yetersiz | düşük `confidence` + `mini_audit` en güvenli açı; kanıtsız iddia yazılmaz |
| LLM boş/bozuk çıktı | `parseColdEmailOutput` → null → 502, taslak yaratılmaz (`error` step) |
| Rol yok | firma-genel/`owner` varsayılan çerçeve (uydurma unvan yok) |
| Voice-guard fail | `revise`; ikinci fail → operatöre elle-düzelt |
| Judge `block` | operatöre gösterilir, gönderim yok |
| Portföy eşleşmesi yok | portföy iddiası eklenmez (uydurma yasak, mig 048 approved-only) |
| Compliance fail | gönderim bloke (12); taslak inert kalır |

## 12. MVP / V1 / V2

- **MVP (plan K1 çekirdeği):** `generate-outreach` (rol-aware, minimal bağlam, evidence grounding) + deterministik validation + Voice Guard + judge + HITL onay. Klişe-liste genişletme (kod, migrationsız). Rol `contacts` (mig 045) hazırsa kullanılır, yoksa firma-genel.
- **V1:** Voice DNA edit-delta yakalama (`final_body` UI adımı + deterministik diff + governance) + `contact_form` kanalı + LinkedIn alt-tipleri + portföy-eşleştirme entegrasyonu (match-portfolio).
- **V2:** `referral` kanalı; voice-pattern'leri yanıt/sonuç ile ilişkilendiren öğrenen görünüm (`sectorRotation.ts` deseni — hangi ton/açı hangi sektör/kanalda dönüşüyor); prompt-cache (16 §4.9).

## Grounding & açık noktalar

- **Repo atıfları:** `coldEmail.ts:7-24` (ColdEmailLead — rol yok), `:51-77` (persona+yasak-liste), `:79-117` (userPrompt seçili-alan), `:124-156` (parse), `:159-172` (imza deterministik), `:180-195` (compliance footer, "ret"-yanıt); `coldEmailTemplates.ts` (4 açı, `:79-84` seçim); `outreach/email.ts:11-40` (markMessageSent kayıt-only, idempotent); `channelMatrix.ts` (CHANNEL_PRIORITY/CustomerType); `memory/governance.ts` (quarantine→active).
- **Migration:** 045 (contacts+role), 046 (outreach_messages additive: original_body/final_body/gmail_*), 050 (agent_memory scope + voice_pattern), 048 (portfolio approved-only).
- **`assumption:`** Voice DNA edit-delta yakalama minimal UI adımı gerektirir (research 09 §7 açık soru); Gmail L2 akışı (12) bu yüzeyi getirir. Çok-kanal `contact_channels` MVP'den ertelendi.
- **Cross-refs:** 12-gmail-and-followup-engine.md (aşama 9 gönderim + follow-up), 13-reply-intelligence.md (takip-açı, reply→outreach), 16-openrouter-routing.md (preset), 07 §2.8/§2.9 (skill spec), 06 §3.4/§3.5 (agent contract).
