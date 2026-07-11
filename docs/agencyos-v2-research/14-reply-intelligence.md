---
Doküman: 14-reply-intelligence
Tarih: 2026-07-11
Kaynak kalitesi: karışık
Güven: orta
AgencyOS'a etki: Gelen prospect yanıtlarını sınıflandırıp pipeline/takip aksiyonuna dönüştürecek bir katman ekler; Gmail ingest olmadan çalışamaz, bu yüzden şimdilik mimari + şema tasarımı olarak durur.
---

## Özet

Reply Intelligence, bir prospect'in soğuk e-postaya/takibe verdiği serbest metin yanıtı **~19 sınıftan birine** ayırıp; bundan `intent/sentiment/urgency/required-action/suggested-reply/suggested-task/pipeline-stage-update/follow-up-date/human-approval-requirement/confidence/evidence-from-message` alanlarından oluşan yapılandırılmış bir karar üreten katmandır. AgencyOS'ta bugün bu iş **tamamen operatörün kafasında** yapılıyor: `outreach_messages.status` şemasında `'replied'` değeri zaten tanımlı (mig 010) ama hiçbir yol bunu set etmiyor — çünkü gelen postayı okuyan bir mekanizma yok. Bu doküman, mevcut `classifyQuestion.ts` (keyword fast-path + ucuz-LLM tie-break) ve `objectionLibrary.ts` (statik itiraz→cevap eşlemesi) desenlerinin **doğrudan genişletilmiş hali** olarak bir tasarım önerir; yeni bir mimari icat etmez.

Kritik bağımlılık: bu katman **Gmail ingest** (okuma + thread eşleme) olmadan hiçbir veri göremez. Bu yüzden MVP net bir şekilde "şema + deterministik ön-filtre + tek LLM sınıflandırıcı, ama Gmail bağlanana kadar test verisiyle/manuel yapıştırmayla çalışır" şeklinde çerçevelenmeli.

---

## 1. Neden ayrı bir katman (mevcut desenlerin üstüne)

| Mevcut yapı taşı | Dosya | Reply Intelligence'a katkısı |
|---|---|---|
| İki-kademeli sınıflandırma deseni | `src/lib/assistant/classifyQuestion.ts` | Keyword fast-path (LLM'siz, ucuz, deterministik) + belirsizlikte tek `callLight` tie-break — reply sınıflandırma da AYNI iki kademeyi kullanmalı |
| İtiraz kütüphanesi | `src/lib/objectionLibrary.ts` | "objection" sınıfı tetiklendiğinde `findObjection(id)` ile hazır TR cevap şablonu — suggested-reply üretiminde ilk kaynak |
| Skill kaydı | `src/lib/skills/catalog.ts` (`sales.objection_handler`, satır 71-77) | riskLevel:'low', tier:'light', budget $0.03 — reply classification skill'i benzer bütçe sınıfında tasarlanmalı |
| Pipeline durumları | `src/lib/types.ts` `LeadStatus` (satır 5-13) | `pipeline-stage-update` çıktısı bu enum'un İÇİNDE kalmalı, yeni state icat edilmemeli |
| Discovery gate | `src/lib/leads/pipelineGate.ts` | "meeting request" / "pricing request" sınıfları `proposal`'a geçişi TETİKLEMEZ — gate hâlâ pain_point+decision_maker+budget_band ister |
| Takip motoru | `src/lib/outreach/sequences.ts` (`processDueSequences`) | Bir reply geldiğinde ilgili `follow_up_sequences` satırı `done=true` yapılmalı (yoksa cron yanıtlanmış lead'e tekrar takip e-postası kuyruklar) |
| Onay altyapısı | `supabase/migrations/043_approvals_hitl.sql` | `suggested-reply` asla otomatik gönderilmez; bu HITL zaten `outreach_messages.status IN ('draft','approved','sent',...)` akışında var, reply intelligence yalnız YENİ bir draft üretir |
| Redaction yardımcıları | `src/lib/brain/gate.ts` (`redactPreview`), `src/lib/trace/spans.ts` | Gelen e-posta gövdesi ham haliyle trace/log'a yazılmamalı — mevcut redaction reuse edilmeli |

Bu tablo, "şunu sıfırdan yaz" değil "şu 8 dosyanın üstüne bir sınıflandırma+aksiyon katmanı ekle" çerçevesini netleştiriyor.

## 2. ~19 sınıflık taksonomi

Görev tanımındaki 18 sınıfa, üretim taksonomilerinde her zaman gereken bir **residual/catch-all** eklenerek 19'a tamamlandı (aşağıdaki "diğer/belirsiz-artık" satırı). Kaynak: Instantly.ai'nin canlı reply-triage ürününde kullandığı 9 kategorilik gerçek taksonomi (birincil kaynak — vendor blog, 2026, güven: orta çünkü pazarlama içeriği ama ürün davranışını tarif ediyor) [1] ile SalesHive/Outreach.io sektör pratiği (ikincil, güven: orta) [2] genişletilerek 19'a çıkarıldı.

| # | Sınıf | Tipik tetikleyici (TR örnek) | Varsayılan required-action | Pipeline stage önerisi |
|---|---|---|---|---|
| 1 | positive_interest | "İlginç görünüyor, detay verir misiniz" | suggested-reply hazırla, task: hızlı yanıt | responded |
| 2 | meeting_request | "Görüşebilir miyiz, ne zaman uygunsunuz" | takvim önerisi + suggested-reply | meeting |
| 3 | pricing_or_portfolio_request | "Fiyat listeniz var mı / örnek işler" | `sales.pricing_explain` skill'ini tetikle (deterministik, mig'siz) | responded |
| 4 | more_info_request | "Nasıl çalışıyorsunuz, süreç nedir" | bilgi e-postası taslağı | responded |
| 5 | referral | "Ben değil ama pazarlama müdürümüz X ilgilenir" | yeni lead kaydı önerisi (task, otomatik oluşturma DEĞİL) | responded |
| 6 | not_now | "Şu an sırası değil, sonra bakarız" | follow-up-date öner (ör. +60 gün), sequence'ı yavaşlat | waiting |
| 7 | no_budget | "Bütçe yok / bu yıl planlanmadı" | follow-up-date öner (ör. +120 gün) | waiting |
| 8 | already_working_with_someone | "Zaten bir ajansla çalışıyoruz" | düşük öncelik, uzun vadeli nurture | waiting |
| 9 | not_interested | "İlgilenmiyoruz" | sequence durdur, follow_up_sequences done=true | lost |
| 10 | unsubscribe | "Listeden çıkarın / bir daha yazmayın" | **anında** suppress + İYS/KVKK kaydı (mig 018 compliance footer akışına bağla) | lost + suppress flag |
| 11 | ooo_auto_reply | "X tarihine kadar izindeyim" | sequence'ı duraklat, gönderimi X+3 gün ertele | değişmez |
| 12 | generic_auto_response | Sistem otomatik teşekkür mesajı | hiçbir insan aksiyonu yok, sessiz not düş | değişmez |
| 13 | bounce | SMTP 5xx/4xx NDR | 5xx → e-postayı öldür (kalıcı), 4xx → 3-5 deneme sonra öldür | değişmez (leads.email invalid flag) |
| 14 | wrong_person | "Ben bu firmadan değilim / yanlış kişiye ulaştınız" | contact bilgisini düzelt, decision_maker alanını temizle | değişmez |
| 15 | negotiation | "Fiyatı X'e çeker misiniz" | `objectionLibrary.ts` + `sales.objection_handler` skill'ini tetikle | proposal (gate'e tabi) |
| 16 | objection | "Neden freelancer'dan pahalı" gibi itiraz | `findObjection(id)` ile eşleşen hazır cevap | responded |
| 17 | spam_or_abuse | Küfür/şikayet/agresif ret | sequence durdur + suppress, operatöre uyarı | lost |
| 18 | ambiguous | Tek kelime, emoji, yorumlanamaz kısa yanıt | insan triage kuyruğuna düş, otomatik aksiyon YOK | değişmez |
| 19 | other_residual | Yukarıdakilerin hiçbirine net uymayan içerik | insan triage kuyruğuna düş | değişmez |

Not: "negotiation" ile "objection" birbirine yakın göründüğü için ayrıştırma kriteri netleştirilmeli: **negotiation** somut bir sayı/koşul teklif ediyor (ör. "%20 indirim olur mu"), **objection** ise genel bir itiraz/şüphe ifade ediyor (ör. "neden bu kadar pahalı"). Bu ayrım mevcut `objectionLibrary.ts` girdileriyle (discount, free_sample, payment_terms, one_off, competitor_cheaper, not_now) zaten örtüşüyor — 5/6 girdi doğrudan bu iki sınıfın altına düşüyor.

## 3. Çıktı şeması

```typescript
interface ReplyClassification {
  intent: ReplyIntent            // yukarıdaki 19 sınıftan biri
  sentiment: 'positive' | 'neutral' | 'negative'
  urgency: 'low' | 'medium' | 'high'
  requiredAction: string         // TR, operatöre gösterilecek tek cümlelik aksiyon
  suggestedReply?: string        // DRAFT — asla otomatik gönderilmez (repo invariantı)
  suggestedTask?: { title: string; dueInDays: number }
  pipelineStageUpdate?: LeadStatus | null   // src/lib/types.ts LeadStatus'tan, yeni değer YOK
  followUpDate?: string | null   // ISO — not_now/no_budget/already_working için
  requiresHumanApproval: boolean // suggestedReply varsa HER ZAMAN true
  confidence: number             // 0-1
  evidenceFromMessage: { quote: string; charStart: number; charEnd: number }[]
}
```

`evidenceFromMessage`, leadIntel'in `evidence_id`'ye bağlı iddia zorunluluğuyla aynı disiplini taşır (bkz. `src/lib/leadIntel/evidenceStore.ts` satır 84-93) — ama burada dış kanıt değil, **gelen mesajın kendisinden birebir alıntı** tutulur; böylece operatör "neden bu sınıfa düştü" sorusuna saniyeler içinde cevap bulur ve modelin uydurup uydurmadığı denetlenebilir.

## 4. Sınıflandırma mimarisi — üç katman

**Katman 0 — Deterministik ön-filtre (LLM'siz, `classifyQuestion.ts`'teki keyword fast-path desenine birebir uyar):**
- Bounce tespiti: gönderen `MAILER-DAEMON`/`postmaster` veya `Return-Path: <>`, gövdede SMTP 5xx/4xx kodu — hard bounce (5xx, ör. 550 5.1.1) kalıcı geçersiz, soft bounce (4xx, ör. 452 4.2.2) 3-5 tekrar sonrası kalıcı sayılır [3].
- Auto-reply/OOO tespiti: `Auto-Submitted: auto-replied` header'ı (RFC 3834) VEYA `Precedence: bulk/auto_reply` VEYA konu satırında regex (`/İzindeyim|out of office|will be back on/i`) [4]. **Uyarı:** Exchange gibi bazı sunucular bu header'ı hiç set etmez — header yoksa bile keyword fallback şart, header tek başına yeterli değil.
- Unsubscribe tespiti: TR/EN anahtar kelime seti ("listeden çıkar", "abonelikten çık", "bir daha yazmayın", "unsubscribe", "remove me") — mevcut `BUSINESS_KEYWORDS`/`LIFE_KEYWORDS` ikili-liste desenine benzer şekilde `UNSUBSCRIBE_KEYWORDS` sabiti.

Bu katman **sıfır maliyetli** ve confidence=1.0 sonucu üretir; 13/11/12/10 sınıflarının çoğu buradan çözülür — LLM'e hiç gitmez (rule: "deterministik işe LLM koyma").

**Katman 1 — Ucuz LLM sınıflandırıcı (yalnız Katman 0 sonuçsuz kalırsa):**
- `callLight` (mevcut `src/lib/openrouter.ts` satır 371-385, `google/gemini-2.5-flash-lite`) ile structured JSON çıktı — Zod şemasıyla sınırda validate edilir (ecc TypeScript kuralı).
- Sistem promptu: 19 sınıf + tanımları + "yalnız JSON döndür" talimatı; `classifyQuestion.ts`'teki "SADECE tek kelime yanıtla" disiplininin genişletilmiş hali.
- Bütçe: `sales.objection_handler` skill kaydındaki gibi (`defaultTier:'light', budgetUsdMax: 0.03-0.05`) — yeni skill `sales.classify_reply` bu aralıkta tanımlanmalı, `src/lib/skills/catalog.ts`'e eklenir (handler henüz wired değil, ~30 skill'in çoğu gibi).

**Katman 2 — Confidence eşiği ve HITL kapısı:**
Sektör pratiği iki eşikli bir model kullanıyor: ≥%90 confidence'ta otomatik yönlendirme, %70-90 arası insan onayına düşer [1]. AgencyOS'un mevcut muhafazakâr varsayılanına (`classifyQuestion.ts`'in belirsizlikte 0.3 confidence + safe-default'a düşmesi) uyarlanmış öneri:

| Confidence | Davranış |
|---|---|
| ≥ 0.85 | pipeline-stage-update + suggested-task otomatik uygulanır; suggested-reply yine DRAFT (asla auto-send) |
| 0.6 - 0.85 | Aksiyon önerilir ama `requires_review=true` ile işaretlenir; operatör onaylamadan pipeline değişmez |
| < 0.6 | Hiçbir otomatik state değişikliği yok; yalnız "belirsiz — manuel triage" kuyruğuna düşer (ambiguous/other_residual'a benzer davranış, sınıf ne olursa olsun) |

Bu, brief'teki "Düşük confidence → otomatik işlem YOK" kuralıyla birebir örtüşüyor ve mevcut `agent_memory` governance'daki (`src/lib/memory/governance.ts`) "tek kötü turun sistemi zehirlememesi" felsefesiyle aynı çizgide.

## 5. Gmail ingest bağımlılığı (bloklayıcı)

Reply Intelligence'ın girdisi olmadan çalışamaz. Doğrulanmış Gmail API yetenekleri (resmî Google Developers dokümantasyonu, güven: yüksek):
- **History API artımlı senkronizasyon**: `users.history.list(startHistoryId=...)` önceki kaydedilen `historyId`'den bu yana değişenleri döner; her lead/thread için `historyId` DB'de saklanmalı [5].
- **Push (Pub/Sub) + watch**: `watch` en fazla 7 günde bir yenilenmeli (günlük önerilir); payload yalnız `emailAddress`+`historyId` taşır, gerçek içerik için ayrıca `history.list` çağrısı gerekir. Kayıp bildirimlere karşı periyodik polling fallback şart [5].
- **Thread eşleme**: `message.threadId` ile aynı konuşmaya ait mesajlar gruplanır; bir `outreach_messages` satırının hangi Gmail thread'ine karşılık geldiğini eşlemek için `outreach_messages`'a `gmail_thread_id`/`gmail_message_id` kolonu eklenmesi gerekecek (mevcut şemada yok — mig 010'da böyle bir alan tanımlanmamış).

Bu doküman migration ÖNERMEZ (görev kısıtı), ama şema ihtiyacını burada not ediyor: `outreach_messages` genişletmesi (thread/message id) + yeni `inbound_messages` (ham gelen posta, redaction sonrası) + yeni `reply_classifications` (yukarıdaki çıktı şeması) tabloları V1 kapsamında migration olarak planlanmalı.

## 6. AgencyOS'a entegrasyon (somut dosya bağlantıları)

- Yeni dosya (öneri, henüz yazılmadı): `src/lib/outreach/classifyReply.ts` — `classifyQuestion.ts` ile aynı iki-kademeli imza deseni (`classifyReply(text, context): Promise<ReplyClassification>`), asla fırlatmaz, hata → `other_residual` + confidence 0.
- `objectionLibrary.ts` ve `findObjection()` — sınıf 15/16 (negotiation/objection) tetiklendiğinde suggested-reply kaynağı olarak doğrudan çağrılır, yeniden yazılmaz.
- `src/lib/leads/pipelineGate.ts` — pipeline-stage-update `proposal`'a işaret ederse dahi gate hâlâ devrede kalmalı; reply intelligence gate'i BYPASS ETMEZ, yalnız "gate'e aday" sinyali üretir.
- `src/lib/outreach/sequences.ts` `processDueSequences` — reply geldiğinde ilgili `follow_up_sequences.done=true` set edilmeli (yoksa cron yanıtlanmış lead'e gereksiz takip kuyruklar); bu entegrasyon noktası V1'de mutlaka kapatılmalı.
- `src/lib/skills/catalog.ts` — yeni `sales.classify_reply` skill kaydı, `sales.objection_handler` ile aynı satırların hemen yanına (permissionScopes: `['leads:read','outreach:write']`, riskLevel:'medium' çünkü pipeline state'i etkiliyor).
- `supabase/migrations/043_approvals_hitl.sql` deseni — eğer ileride "yüksek confidence'ta otomatik gönder" seçeneği açılırsa (V2, varsayılan KAPALI), bu mutlaka `approval_requests` üzerinden geçmeli; MVP/V1'de suggested-reply zaten hep draft.
- `src/lib/brain/gate.ts` `redactPreview` — gelen e-posta gövdesi trace span'e veya loglara ham yazılmadan önce reuse edilmeli.

## 7. MVP / V1 / V2 ayrımı

- **MVP**: Şema tasarımı + Katman 0 deterministik filtreler (bounce/OOO/unsubscribe regex, sıfır LLM maliyeti) + `classifyReply.ts`'in geri kalan ~15 sınıf için tek `callLight` çağrısıyla JSON döndürmesi. Girdi Gmail'den DEĞİL, manuel yapıştırılan metinden test edilir (Gmail bağlı değilken de kod doğrulanabilir olsun diye). Hiçbir otomatik pipeline değişikliği yok — yalnız öneri gösterilir, operatör tıklayıp uygular.
- **V1**: Gmail History API ingest + `inbound_messages`/`reply_classifications` migration + `outreach_messages`/`follow_up_sequences` otomatik güncellemesi (≥0.85 confidence'ta) + `processDueSequences` entegrasyonu.
- **V2**: Push (Pub/Sub) gerçek zamanlı ingest (polling yerine), confidence eşiklerinin gerçek sonuçlara göre kalibrasyonu (brief'teki gibi "gerçek satış sinyaliyle" öğrenen eşik — `sectorRotation.ts`/`cityTargeting.ts`'teki öğrenen görünüm desenine benzer), ve yalnız KULLANICI açıkça isterse yüksek-confidence otomatik gönderim (varsayılan KAPALI, approval_requests üzerinden).

## 8. Açık sorular / doğrulanamayanlar

- [UNKNOWN] Exchange/Outlook kaynaklı OOO yanıtlarının ne oranda `Auto-Submitted` header'ı taşımadığı — kaynak bunun "bazı Exchange konfigürasyonlarında hiç set edilmediğini" söylüyor ama oran vermiyor; bu yüzden keyword fallback MVP'de zorunlu, header tek başına yeterli varsayılmamalı.
- [ASSUMPTION] 19 sınıfın "negotiation" vs "objection" ayrımı bu dokümanda önerilen kriterle (somut sayı vs genel şüphe) net değilse, gerçek yanıt verisiyle birlikte ayarlanmalı — şu an hiç gerçek reply verisi yok, taksonomi teorik.
- [UNKNOWN] Confidence eşiklerinin (0.85/0.6) AgencyOS'un düşük hacimli (günde birkaç yanıt) ortamında ne kadar isabetli olacağı — sektör verisi büyük hacimli (binlerce yanıt/ay) platformlardan geliyor, düşük hacimde istatistiksel kalibrasyon mümkün olmayabilir; MVP'de eşikler sabit sabit tutulup gözlemsel olarak ayarlanmalı.
- [LIKELY] `already_working_with_someone` ve `no_budget` sınıflarının ikisi de "waiting" pipeline durumuna düşüyor önerisinde — bunların farklı `follow_up_date` varsayılanları olması mantıklı (120 gün vs 60 gün) ama bu tamamen tahmine dayalı, gerçek veriyle doğrulanmadı.
- Hukuki: unsubscribe/spam sınıflarının İYS/KVKK'ya bildirim zorunluluğu doğurup doğurmadığı bu dokümanın kapsamı dışında — ayrı hukuki inceleme flag'i (compliance dokümanında zaten var).

---

**Kaynaklar:**
[1] Instantly.ai, "Cold Email Reply Triage Explained: How agencies identify qualified replies faster" — https://instantly.ai/blog/cold-email-reply-triage-explained-agencies/ (2026, vendor blog, güven: orta)
[2] SalesHive Sales Glossary, "Response Categorization" — https://saleshive.com/glossary/response-categorization/ (güven: orta, ikincil sektör pratiği)
[3] Bounce kod referansları: SMTPedia "Hard Bounce vs Soft Bounce" (https://smtpedia.com/hard-bounce-vs-soft-bounce/), Mail-Tester "Email Bounce Codes: SMTP 4xx vs 5xx" (https://mail-tester.com/blog/soft-vs-hard-bounces/) — RFC 3463 enhanced status code'larına dayanır (güven: yüksek, teknik standart)
[4] RFC 3834, "Recommendations for Automatic Responses to Electronic Mail" — https://datatracker.ietf.org/doc/html/rfc3834 (IETF resmi standart, güven: yüksek); pratik tespit notları arp242.net "How to detect automatically generated emails" — https://www.arp242.net/autoreply.html (güven: orta)
[5] Google for Developers, "Method: users.history.list" (https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list) ve "Configure push notifications in Gmail API" (https://developers.google.com/workspace/gmail/api/guides/push) — resmi Google dokümantasyonu, güven: yüksek
