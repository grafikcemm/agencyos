---
Doküman: RESEARCH-SYNTHESIS
Tarih: 2026-07-11
Kaynak kalitesi: birincil repo denetimi + 21 araştırma dokümanı + canlı web/OpenRouter doğrulaması
Güven: yüksek (mevcut durum + faz mantığı) / orta (dış bağımlılıklar)
AgencyOS'a etki: Master planning görevine devredilecek ana sentez ve karar belgesi.
---

# AgencyOS v2 — Araştırma Sentezi

> Bu belge diğer dokümanların basit özeti değil; **planlamaya taşınacak kararların** kaynağıdır. Etiketler: `[CERTAIN]` doğrulandı / `[LIKELY]` güçlü kanıt / `[ASSUMPTION]` makul varsayım / `[UNKNOWN]` doğrulanamadı.

## 1. AgencyOS'un mevcut durumu
Tek operatörlü (Cem), Türkçe, dark-Framer temalı bir satış+yaşam OS'u. Next.js 16 + React 19 + iki Supabase (İş + LIFE). **Hedef Revenue-OS vizyonunun ~%65'i zaten kodlanmış ama çoğu shadow/kapalı** `[CERTAIN]`: Brain v2, HITL onay, skill/agent registry, Lead Intelligence v2 (evidence+council+2/gün), trace/eval, model router+cost cap, ICP öğrenen hedefleme, anti-klişe cold-email+KVKK footer, governed memory. Canlı sistem hâlâ eski/basit yolları kullanıyor. Detay: `01-current-state-audit.md`.

## 2. En kritik ürün sorunları
1. **Satış döngüsü kapalı değil** `[CERTAIN]`: sistem outreach taslağı üretir ama GÖNDEREMEZ, yanıtı GÖREMEZ, follow-up'ı tam yönetemez. Zihinsel yükün asıl kaynağı (takip/hatırlama) hâlâ Cem'de.
2. **Karar dağınık** `[CERTAIN]`: "bugün ne yapmalıyım" 4 ekrana yayılmış (`/harita`,`/firsatlar`,`/pipeline`,`/command-center`); tek günlük karar merkezi yok.
3. **Olgun temel atıl** `[CERTAIN]`: Brain v2/registry/eval hazır ama OFF; değer üretmiyor.
4. **Model katmanı kırık** `[LIKELY]`: canlı model ID'leri muhtemelen superseded, fallback yok → sessiz 404 riski.
5. **Voice/portfolyo/hafıza jenerik** `[CERTAIN]`: kişiselleştirme kanıtı zayıf; Cem'in kendi işleri ve öğrenen tonu modellenmemiş.

## 3. Korunacaklar (dokunulmaz)
- **Görev/Alışkanlık/Rutin** (`/gorevler`,`/aliskanliklar`, LIFE DB: active_tasks/habits/habit_logs) — izole, temiz, çalışıyor `[CERTAIN]`. v2 yalnız "satıştan ayır" der, koda dokunmaz.
- **Yapısal güvenlik rayları**: offer-matcher katalog-kilidi, council evidence_id zorunluluğu, digest-locked HITL, lethal-trifecta guard, RLS+REVOKE, cost cap, never-throw pipeline'lar — hepsi korunur ve yeni yeteneklere genişletilir `[CERTAIN]`.
- **Olgun motorlar**: ICP sektör/city×sector öğrenen hedefleme, Lead Intelligence v2, compliance footer — yeniden yazılmaz, aktive/genişletilir.

## 4. Önerilen günlük satış akışı
Tek "Günlük Satış Merkezi" (mevcut `command-center`'ı komuta katmanına dönüştür, diğer 3 ekran derinlik katmanı) `[LIKELY]`. Cevaplaması gereken 10 soru sırasıyla tek ekranda: bugün araştırılacak/iletişim kurulacak leadler → onay bekleyen taslaklar → follow-up zamanı gelenler → yanıt bekleyenler → yeni yanıtlar → teklif bekleyenler → riskli/geciken fırsatlar → günün aktif görevleri. Yaşam (ritim/alışkanlık) bloğu command-center'dan ÇIKARILIR (Sidebar zaten TOP'ta ayırıyor). `/konsol`+`/agents` SİSTEM'e taşınır (günlük göreve rakip olmasın). Detay: `02-product-and-daily-ux.md`.

## 5. Motor-motor öneriler (mevcudun üstüne)
- **Lead motoru & qualification** `[CERTAIN]`: mevcut (Places+city×sector+evidence+council+scoring) yeterli; **koru, shadow→active al**. Yeni scoring sistemi kurma.
- **Service matching / Offer Architect** `[LIKELY]`: mevcut `offerMatcher.ts` deterministik/açıklanabilir deseni doğru; üstüne teklif-seviyesi (micro→retainer→pilot) + "neden şimdi/neden Cem/hangi portfolyo" katmanı. Her lead'e retainer/ücretsiz önerme. (`08-offer-architecture`)
- **Portfolyo/proof** `[CERTAIN]`: yeni `portfolio_items`+`portfolio_claims`; **isim çakışmasına dikkat** (emlak "portföy" paketi zaten var → `portfolio_item`/`case_study` kullan). Deterministik skor (sektör+similarServices), yalnız `approved=true` iddia dışa çıkar, eşleşme yoksa hiçbir şey ekleme. (`07-portfolio-and-proof-matching`)
- **Outreach & Voice DNA** `[LIKELY]`: klişe listesini genişlet (MVP, migration'sız); edit-delta yakalama için taslak-düzenleme UI adımı gerek `[UNKNOWN]` (bugün kopyala-yapıştır olabilir — Cem'e sorulmalı). Voice DNA V1-V2. (`09-outreach-personalization`)
- **Gmail** `[CERTAIN]`: L0-L4 otomasyon; varsayılan L1-L2; `gmail.send`-only MVP + HITL; duplicate-send önleme idempotency. **OAuth blokörü** (bkz. §7). (`12-gmail-integration`)
- **Follow-up** `[LIKELY]`: mevcut `follow_up_sequences`'ı state-machine'e tamamla; iş-günü/TR-tatil/timezone; yanıt/bounce/unsubscribe/manuel'de dur; 1. FU 3-4 iş günü, 2. FU 5-7 (segment-bazlı ayarla); deterministik = LLM yok. (`13-follow-up-engine`)
- **Reply intelligence** `[LIKELY]`: şema + deterministik ön-filtre (bounce/OOO/unsubscribe regex, sıfır LLM) + ~15 sınıf için tek `callLight`; düşük confidence → otomatik iş yok; **Gmail ingest'e bağımlı** ama manuel-yapıştırmayla test edilebilir. (`14-reply-intelligence`)
- **Proposal** `[LIKELY]`: mevcut `proposalGenerator` üstüne `proposal_versions` (versiyonlama+fiyat snapshot+evidence refs); proposal gate (pain+decision-maker+budget) korunur; uydurma metrik engeli. (`15-proposal-engine`)
- **İlişki hafızası** `[LIKELY]`: mevcut `agent_memory` governance (quarantine/confidence/retention) üstüne Contact/Company/Outreach/Offer/UserPreference katmanları; **namespace ayrımı ZORUNLU** (cross-lead sızıntı). (`16-relationship-memory`)

## 6. Model / maliyet yaklaşımı
- **Canlı doğrulanmış** `[CERTAIN]`: brief'in `qwen3.5-flash-02-23`/`deepseek-v3.2`/`gpt-5.4-nano`/`gemini-3.1-flash-lite-preview` = OpenRouter'da YOK. Mevcut: `gpt-5.6-luna`, `claude-sonnet-5`, `gpt-5.6-terra`, `grok-4.5`. Ucuz: `qwen3.6-flash`, `gemini-3.5-flash`, `claude-opus-4.8`.
- **Repo modelleri** `[LIKELY]` superseded (`gemini-2.5-flash-lite`/`deepseek-v4-pro`); `[UNKNOWN]` gerçekten 404 mü yoksa alias mı — canlı key ile teyit gerek.
- **Öneri**: tek `PRESETS` kaynağı (dört yere gömülü model string'lerini birleştir) + `models:[primary,...fallbacks]` dizisi (expiration self-heal) + provider policy (sort:price default, Tier3-4 data_collection:deny). Tier 0 deterministik = LLM yok. Çapraz-aile Tier-5 judge. (`18-openrouter-model-routing`)
- **Maliyet** `[CERTAIN]`: üç senaryonun (5/15-20/50+ lead/gün) hepsinde LLM maliyeti mevcut cap'lerin ($0.40/gün + $20/ay) altında; cap değişimi gerekmiyor. Tool (Places/PSI/Apollo) maliyeti asıl belirsizlik → V1'de tool-cost logging. (`24-cost-scenarios`)

## 7. Tek en büyük blokör (planlamaya kritik)
**Gmail OAuth** `[UNKNOWN→BLOKÖR]`: ortamda yetkilendirilmemiş; fabrike edilemez (takvim OAuth blokajıyla aynı sınıf). Reply intelligence ve follow-up otomasyonu buna bağımlı. **Sonuç: MVP'yi Gmail'siz tasarla; Gmail'e bağımlı işler V1'e ertelensin. Cem connector onayı vermeli.**

## 8. MVP / V1 / V2 (birleşik yol haritası)
**MVP** — Gmail'siz, çoğu migration'sız, en hızlı değer/en düşük risk:
- Model ID fix + fallback dizisi (URGENT, `[CERTAIN]` yüksek değer).
- Brain v2 deterministik skill aktivasyonu: `schedule_follow_up`(tamamla), `recommend_next_action`, `audit_compliance`, `audit_deliverability`, `match_portfolio`, `build_offer_angle` — LLM'siz → `BRAIN_ACTIVE_ENABLED` güvenli.
- Günlük cockpit yeniden kompoze (yaşam bloğunu çıkar, follow-up/riskli şeritlerini bağla, LeadDrawer'a kanal önerisi, sidebar taşı) — yeni tablo yok.
- `portfolio_items`+`portfolio_claims` + elle giriş formu + deterministik skor.
- cold-email klişe listesi + `isFreemail` uyum sinyali + `outreach_suppressions` alanı.

**V1** — Gmail yetkisi geldiğinde:
- `gmail.send` + HITL taslak/gönder (idempotency); Postmaster Tools + SPF/DKIM/DMARC doğrulama.
- Reply ingest + sınıflandırma (`inbound_messages`/`reply_classifications`); ≥0.85 confidence'ta pipeline güncelleme.
- Follow-up `follow_up_rules` state-machine + scheduler iptal mantığı.
- İlişki hafızası genişletme (Contact/Company/Outreach/Offer) + namespace ayrımı.
- `proposal_versions`; tool-cost logging.

**V2**:
- Pub/Sub push reply (polling yerine); confidence eşik kalibrasyonu.
- Öğrenen Voice DNA (edit-delta → agent_memory voice_pattern).
- Yüksek-confidence otomatik follow-up önerisi (varsayılan KAPALI, approval_requests).
- Prompt caching; deliverability monitoring; nightly model-drift cron.

## 9. Paralel workstream'ler ve shared contract'lar
Kodlama paralelleşmeden ÖNCE bitmesi gereken shared contract'lar `[LIKELY]`: (a) entity şemaları (Contact/EmailThread/EmailMessage/ReplyAnalysis/FollowUpRule/PortfolioItem/memory katmanları), (b) event sözleşmeleri, (c) skill input/output şemaları + `registry.ts` handler wiring, (d) model preset sözleşmesi, (e) audit log/trace formatı, (f) HITL onay modeli, (g) state machine tanımları. Bunlar Brain v2/registry/run-step foundation üstünde zaten kısmen mevcut. Kritik yol: **shared contracts → MVP deterministik skill'ler + cockpit + model-fix (paralel) → (Gmail OAuth) → V1 e-posta döngüsü**. Detay: `25-parallel-workstreams.md`.

## 10. Araştırma sırasında çözülemeyenler (planlamada karara bağlanmalı)
- `[UNKNOWN]` Gmail OAuth ne zaman/nasıl yetkilenecek (blokör).
- `[UNKNOWN]` Canlı DB'de hangi migration'lar fiilen uygulanmış (manuel-apply drift; `list_migrations` ile teyit).
- `[UNKNOWN]` Repo model ID'leri gerçekten 404 mü (canlı key testi).
- `[UNKNOWN]` Cem'in gönderim domain'inde SPF/DKIM/DMARC var mı (DNS kontrolü).
- `[UNKNOWN]` Outreach taslağı düzenleme UI adımı var mı (Voice DNA edit-capture bağımlılığı).
- `[UNKNOWN]` `leads.status='waiting'` gerçek kullanımı (pipeline birleştirme kararı için DB sayımı).
- `[UNKNOWN]` Ölü kod (`/dashboard`, RightPanel, KanbanBoard) kasıtlı-taslak mı — Cem kararı.
- Hukuki: KVKK/İYS kesin yükümlülükler — profesyonel inceleme.

## 11. Planlamaya taşınacak kararlar (özet)
1. **Yeni sistem kurma; mevcut Brain v2/registry/Lead-Intel'i aktive et.** `[CERTAIN]`
2. **MVP'yi Gmail'siz tasarla; e-posta döngüsü V1.** `[CERTAIN]`
3. **Model-fix'i ilk yap (URGENT, düşük maliyet).** `[LIKELY]`
4. **Tek günlük cockpit = yeniden kompoze, yeni ekran değil; görev/alışkanlık ayrı, dokunulmaz.** `[LIKELY]`
5. **Her e-posta gönderimi HITL; düşük hacim + opt-out + suppression; asla otonom kritik gönderim.** `[CERTAIN]`
6. **Portfolyo isim çakışmasından kaçın; yalnız onaylı iddia dışa; uydurma yok.** `[CERTAIN]`
7. **Namespace ayrımı V1 öncesi (cross-lead memory sızıntısı).** `[LIKELY]`
8. **Reply ingest gelince prompt-injection kontrolü mimari şart.** `[CERTAIN]`
9. **Shared contracts bitmeden paralel kodlama başlatma.** `[LIKELY]`
10. **Hukuki + OAuth + DNS + DB-drift dış doğrulamaları planın ilk adımı.** `[CERTAIN]`
