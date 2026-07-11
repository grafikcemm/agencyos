---
Doküman: 00-executive-summary
Tarih: 2026-07-11
Kaynak kalitesi: birincil (repo denetimi) + canlı web/OpenRouter doğrulaması
Güven: yüksek (mevcut durum) / orta (dış bağımlılıklar: Gmail OAuth, canlı DB, mevzuat)
AgencyOS'a etki: Tüm v2 kararlarının üst özeti; master planning görevinin giriş belgesi.
---

# AgencyOS v2 — Yönetici Özeti

## 1. En önemli tek bulgu
AgencyOS, brief'in "sıfırdan kurulacak" varsaydığı **AI-native Revenue OS vizyonunun ~%65'ini zaten içeriyor** — ama çoğu **shadow/kapalı (off-by-default), parity-guard'lı bir paralel temel** olarak. Doğru strateji: **yeni sistem kurmak değil, mevcut temeli aktive etmek + 7 gerçek eksiği doldurmak.** Bu, North Star ile birebir uyumlu ("mevcut sistemleri finalize et → para kazan, yeni sistem kurma").

## 2. Zaten var (koru + genişlet)
Brain v2 (intake→plan→route→gate→execute→active + HITL onay + lethal-trifecta guard), skill/agent registry, Lead Intelligence v2 (evidence + multimodal council + 2/gün), trace/eval, model router + cost cap, ICP sektör/city×sector öğrenen hedefleme, anti-klişe cold-email + KVKK footer, governed memory. Detay: `01-current-state-audit.md`.

## 3. En yüksek değerli 7 eksik (asıl build hedefi)
| # | Eksik | Bağımlılık | İlk faz |
|---|---|---|---|
| 1 | **Gmail gönderme + yanıt okuma** (hiç yok, manuel-dispatch) | OAuth (BLOKÖR) | MVP: yalnız `gmail.send` + HITL |
| 2 | **Reply intelligence** (gelen yanıt sınıflandırma) | #1'e bağımlı | MVP: şema + deterministik filtre + tek LLM; manuel-yapıştırmayla test |
| 3 | **Follow-up state machine** (yarım) | — (deterministik) | MVP: mevcut sequences'ı state-machine'e tamamla |
| 4 | **Tek günlük satış merkezi** (4 ekrana dağılmış) | — | MVP: mevcut ekranları BOZMADAN yeniden kompoze |
| 5 | **Portfolyo/proof matching** (yok) | — | MVP: `portfolio_items` + elle giriş + deterministik skor |
| 6 | **Öğrenen Voice DNA** (yok) | edit-capture UI | V1-V2 |
| 7 | **İlişki hafızası** (jenerik) | — | V1 |

## 4. İki acil, düşük-maliyetli, yüksek-değerli aksiyon (MVP'nin önünde)
- **A. Model ID tazeleme (URGENT):** Canlı router'daki `deepseek/deepseek-v4-pro`, `google/gemini-2.5-flash-lite`, `anthropic/claude-haiku-4-5` muhtemelen superseded/kırık. Brief'in önerdiği modellerin yarısı OpenRouter'da **NOT FOUND**. `callOpenRouter`'a `models:[primary,...fallbacks]` dizisi eklemek expiration'ı kendiliğinden onarır. Detay: `18-openrouter-model-routing.md`.
- **B. Brain v2 deterministik skill'lerini aktive et:** follow-up tamamlama, next-action, compliance-audit, deliverability-audit, portfolio-match, offer-angle — hepsi LLM'siz/dış-entegrasyonsuz/düşük-risk → `BRAIN_ACTIVE_ENABLED` ile güvenle açılabilir. Detay: `17-agent-and-skill-architecture.md`.

## 5. Tek en büyük blokör
**Gmail OAuth yetkisi.** Ortamda "claude.ai Gmail" connector'ı yetkilendirilmemiş; gerçek gönderme/okuma operatörün (Cem'in) kendi Google Cloud OAuth istemcisi veya connector onayını gerektirir — **fabrike edilemez** (takvim entegrasyonundaki OAuth blokajıyla aynı sınıf). Reply intelligence (#2) ve follow-up otomasyonu (#3'ün V1'i) buna bağımlı. Ama MVP'lerin çoğu (deterministik skill'ler, cockpit, portfolyo, model-fix, compliance) **Gmail'siz ilerleyebilir.**

## 6. Değişmez ilkeler (tüm dokümanlarda sabit)
- **İnsan onayı (HITL) zorunlu** — kritik e-posta asla otonom gönderilmez; her gönderim `approval_requests` üzerinden.
- **Düşük hacim + opt-out** — yüksek hacimli izinsiz spam sistemi ÖNERİLMEZ. TR mevzuatı: tacir/esnaf iş adresine ön-onaysız B2B, ilk itirazda dur + İYS.
- **Deterministik işe LLM yok** — tarih/dedup/state-transition/suppression saf kod.
- **Uydurma yok** — kanıtsız metrik/portfolyo/övgü üretilmez; her iddia kaynaklı.
- **Görev/Alışkanlık modülü dokunulmaz** (`/gorevler`,`/aliskanliklar`, LIFE DB).
- **Kod-migration-değiştirmeme** bu araştırma görevi boyunca geçerli.

## 7. Önerilen faz özeti
- **MVP** (Gmail'siz, çoğu migration'sız): model-fix + Brain v2 deterministik skill aktivasyonu + günlük cockpit yeniden kompoze + portfolyo elle giriş + cold-email klişe/compliance sinyalleri + suppression alanı.
- **V1** (Gmail geldiğinde): `gmail.send` + HITL taslak/gönder, reply sınıflandırma (ingest), follow-up state-machine tamamlama, ilişki hafızası genişletme, proposal versioning.
- **V2**: Pub/Sub push reply, öğrenen Voice DNA, yüksek-confidence otomatik follow-up önerisi (varsayılan KAPALI), deliverability monitoring.

Tam gerekçe ve kararlar: `RESEARCH-SYNTHESIS.md`.
