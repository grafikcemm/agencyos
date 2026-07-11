# 20 — Observability & Analytics (V2)

> Dalga 2 · motor dokümanı. Rapor 22 (Observability) araştırma raporlarında **EKSİK** — bu doküman onu yeniden inşa eder (plan §3: "eksik rapor içeriği yeniden inşa edilecek"). İki AYRI dashboard: **User Analytics** (Ali Cem satış sonucu görür) ve **System Health** (operatör sistem sağlığı görür). Teknik metrikler ana "Bugün" ekranına **yığılmaz**.
>
> **Kaynak zinciri:** onaylı plan §4 (nav recompose, BUGÜN kokpiti) + §6 (bu doküman satırı) · repo: `src/lib/ai/costLog.ts`, `src/lib/ai/caps.ts`, `src/app/api/cron/agent-tick/route.ts` (notifyOps), `run_spans`/`ai_cost_logs`/`agent_tasks` şeması · `05-event-contracts.md` (event kaynakları) · `16-openrouter-routing.md` §6 (nightly model verify) · `19-data-and-worker-architecture.md` (worker'lar).
>
> **Bu doküman kod yazmaz** — hedef mimariyi kilitler.

---

## 1. Neden İKİ ayrı dashboard (temel ilke)

Ali Cem bir **kullanıcıdır** (satış sonucu ister), operatör olarak **sistem sağlığını** ancak bir şey bozulunca görmek ister. Bu iki ihtiyaç birbirine karıştırılırsa "Bugün" ekranı teknik gürültüyle dolar (fallback sayıları, retry, token maliyeti) → asıl iş (incelenecek lead, onay bekleyen outreach) gömülür. Global kural (`rules/os/70-ui-and-product-quality.md`): birincil görev ≤3 adımda erişilebilir; yeni ekran son çare.

**Karar:**
- **User Analytics** → **BUGÜN kokpitinin** parçası (satış sonuç metrikleri; plan §4 `/command-center` temeli).
- **System Health** → **SİSTEM grubunda** ayrı yüzey (Ajanlar/Konsol/Modeller/Workers/Costs/Logs altında); yalnız operatör-teşhis; ana ekrana **sızmaz**.
- **Köprü:** System Health'te CRITICAL bir durum (Gmail sync bozuk, provider down, cap aşımı) varsa BUGÜN'de **tek satırlık sessiz uyarı şeridi** belirir ("Sistem: Gmail senkronu 6 saattir durdu") — detay değil, System Health'e link. Anti-bloat: sağlıklıyken hiçbir teknik metrik görünmez.

---

## 2. User Analytics (BUGÜN kokpiti — satış sonucu)

**Kime:** Ali Cem. **Amaç:** "Bugün satış döngüm nerede?" **Kaynak:** deterministik sorgular (`leads`, `email_messages`, `reply_classifications`, `proposals`, `follow_up_sequences`) — **LLM YOK**, türetilmiş sayımlar.

| Metrik | Tanım | Kaynak sorgu | Neden kullanıcı-değeri |
|--------|-------|--------------|------------------------|
| **Bugünkü yeni lead** | Bugün `leads` upsert (inserted) | `leads WHERE created_at::date=today` | Funnel girişi |
| **İnceleme bekleyen** | Qualified ama outreach'siz | `leads status='new/responded'` + assessment | İş listesi (aksiyon) |
| **Contacted (bugün)** | Bugün gönderilen outreach | `email_messages direction='outbound' sent_at::date=today` | Aktivite |
| **Yeni yanıt** | Sınıflandırılmış inbound | `reply_classifications created_at::date=today` | Aksiyon (sıcak) |
| **Olumlu yanıt** | `intent='olumlu'` | `reply_classifications intent='olumlu'` | Dönüşüm sinyali |
| **Toplantı** | Meeting-stage lead | `leads status='meeting'` | Pipeline ilerleme |
| **Teklif** | Bugün gönderilen proposal | `proposals status='sent' sent_at::date=today` | Kapanışa yakın |
| **Kazanılan** | `converted` + `projects` | `leads status='converted'` bugün | Sonuç ($) |
| **Follow-up zamanı** | Bugün due sequence | `follow_up_sequences state='pending' scheduled_at≤now` | Aksiyon (hatırlatma) |
| **Outreach kabul oranı** | Olumlu / gönderilen (dönem) | oran hesabı | Kalite/etkinlik |
| **Kazanılan zaman** | Otomatik üretilen taslak × ~ort. süre | `outreach_messages`+`proposals` sayımı × sabit | "Sistem bana ne kazandırdı" (değer hikayesi) |

- **"Kazanılan zaman" [ASSUMPTION]:** taslak-başına elle-yazım tasarrufu sabit bir tahmindir (ör. outreach ~10dk, proposal ~30dk); gerçek değil, motivasyon metriği — açıkça "tahmini" etiketli gösterilir.
- **Trend:** her metrik için dün/bu-hafta karşılaştırma (küçük sparkline); ayrı sayfa değil, kokpit-içi.
- **Boş durum:** funnel boşsa "Bugün taranacak yeni lead yok — tarama yarın 05:00'te" (empty state tasarlı, `rules/os/70`).

---

## 3. System Health (SİSTEM grubu — operatör teşhis)

**Kime:** operatör (bir şey bozulunca). **Amaç:** "Sistem sağlıklı mı, nerede tıkandı?" **Kaynak:** `agent_tasks`, `run_spans`, `ai_cost_logs`, `tool_cost_logs`, `approval_requests`, `model.fallback.used` event, `notifyOps`. **Ana ekrana YIĞILMAZ.**

| Panel | Metrik | Kaynak | Alarm eşiği |
|-------|--------|--------|-------------|
| **Job durumu** | `agent_tasks` queued/working/error/blocked sayıları; bayat working; en eski queued yaşı | `agent_tasks` gruplu | error>0 veya en-eski-queued>1sa → uyarı |
| **Gmail sync** | Son `last_synced_at`; watch_expires_at; historyId-404 recovery sayısı | `email_threads`, `gmail_accounts` | son sync>6sa → CRITICAL |
| **Provider hataları** | OpenRouter 4xx/5xx/timeout; Places hataları; PSI hataları | `run_spans status='error'` kind='llm/tool' | oran-artışı → uyarı |
| **Fallback kullanımı** | `model.fallback.used` (primary→fallback); hangi preset/model | event + `ai_cost_logs.fallback_used` | primary sürekli fallback → model drift (16 §6) |
| **Maliyet** | Günlük/aylık LLM ($); `tool_cost_logs` Places ($); cap kullanım % | `ai_cost_logs`+`tool_cost_logs` toplam | aylık>$20 cap %80 veya günlük lead-intel>$0.40 %80 → uyarı |
| **Structured-output hataları** | Geçersiz-JSON retry oranı; deterministik-fallback'e düşüş | `run_spans` retry attributes | oran-artışı → prompt/model sorunu |
| **Veri tazeliği** | Bayat lead (refresh gecikmiş); bayat evidence; retention kuyruğu | `leads.last_*_at`, `lead_evidence.collected_at` | eşik-ötesi bayat → data-expiry/refresh gecikmesi |
| **Agent run hataları** | `agent.failed` event; hangi agent/skill; error_code | `run_spans`+`agent_tasks status='error'` | tekrarlayan aynı-agent hatası → uyarı |
| **Retry** | Adım-başına attempt dağılımı; backoff durumu | `agent_tasks.attempts` | maxAttempts'e yakın çok satır → altta yatan sorun |
| **Dead-letter** | Kalıcı `error` (maxAttempts tükendi) — el değmesi gereken | `agent_tasks status='error' attempts≥max` | >0 → operatör aksiyonu |
| **HITL bekleyen** | `blocked_on_approval` + digest/TTL durumu | `approval_requests`, `agent_tasks` | TTL-yakın onay → hatırlatma |
| **Model drift** | Nightly `model-health-check` sonucu; ölü/pahalı/eskimiş preset ID | `16-routing.md` §6 çıktısı | katalogdan-kayıp primary → CRITICAL |

- **Redaction:** tüm paneller `run_spans` redacted (ham prompt/PII/e-posta gövdesi YOK, `mig 044:18`). ID + özet + sayım gösterir.
- **notifyOps entegrasyonu:** mevcut `notifyOps` (`agent-tick` deseni) System Health'in **push** kanalıdır; dashboard **pull** görünümüdür. İkisi aynı `run_spans`/`ai_cost_logs`/error kaynaklarını okur.

---

## 4. Nightly model-verify bağı (16-routing §6)

`model-health-check` worker'ı (`19-data-worker` §3.13) her gece `GET /api/v1/models` çeker, `PRESETS` primary+fallback ID'lerini canlı katalogla karşılaştırır. **Sonuç yalnız System Health'e akar** (kullanıcı-analytics'e ASLA):

- **Alarm:** (a) preset modeli katalogdan **kayboldu** (404 → drift), (b) fiyat `ceiling` üstüne çıktı, (c) `verifiedAt`>30 gün eskidi.
- **Neden kritik:** bu dokümanın kardeşi `16` bugün 3 ölü model ID buldu (`gemini-2.5-flash-lite`, `claude-haiku-4-5`, `deepseek-v4-pro` — canlı 404). Nightly verify olmasa, ölü ID canlı kullanıcı isteği patlayana kadar görünmezdi → stale-model riski reaktiften proaktife taşınır. Kaybolan primary → fallback zaten çalıştığı için sistem ayakta; uyarı **proaktif düzeltme** içindir.

---

## 5. Uygulama notları (anti-bloat)

- **Yeni tablo AÇMA:** her iki dashboard mevcut tabloları (`leads`, `email_messages`, `reply_classifications`, `proposals`, `follow_up_sequences`, `agent_tasks`, `run_spans`, `ai_cost_logs`, `tool_cost_logs`, `approval_requests`) + event'leri (`05`) okur. Metrik-toplama tablosu (`analytics_daily` vb.) **MVP-fazlası** — read-time aggregate yeter (tek-kullanıcı, düşük hacim). Ağırlaşırsa materialized view.
- **Cost-aggregation worker** (`19` §3.12) günlük/aylık rollup'ı zaten hesaplıyor → System Health maliyet paneli onu okur; parity KIRILMAZ (`costLog.ts:6-9`).
- **Tek-kullanıcı gerçeği:** çok-tenant analytics, kullanıcı-segmentasyonu, funnel-A/B YOK. Ali Cem tek operatör (`auth.ts LOCAL_USER`).
- **Her durum tasarlı** (`rules/os/70`): loading (skeleton), empty (funnel boş / sistem sağlıklı), error (sorgu düştü → "veri geçici alınamadı"), success. System Health "her şey yeşil" durumu **pozitif** gösterilir (sessiz değil).
- **Mobil + masaüstü:** BUGÜN kokpiti mobil-öncelikli (kullanıcı sahada); System Health masaüstü-ağırlıklı (teşhis). İkisi de responsive doğrulanır.

---

## Grounding & açık noktalar

- **Repo atıfları:** `costLog.ts` (`ai_cost_logs`, council parity, `actual_cost_usd`/`generation_id`), `caps.ts` ($20/ay + settings-override), `agent-tick/route.ts` (notifyOps, reclaim, queued/working sayımı), `run_spans` (mig 044 redacted), `approval_requests` (mig 043 digest/TTL), `agent_tasks` (mig 038 attempts/status).
- **Event kaynakları (`05`):** `model.fallback.used`, `agent.failed`, `email.sent/replied/bounced`, `reply.classified`, `followup.due`, `proposal.created/sent` — dashboard'lar bu event'lerin durable/ephemeral izlerini okur.
- **[ASSUMPTION]** "Kazanılan zaman" taslak-başına sabit tasarruf tahmini (gerçek değil, motivasyon metriği, "tahmini" etiketli); `analytics_daily` rollup tablosu gerekmez (read-time aggregate yeter, tek-kullanıcı).
- **[UNKNOWN]** Gmail sync "6 saat" CRITICAL eşiği operatör kalibrasyonu; provider-hata oran-artışı eşiği canlı veriyle ayarlanır.
- **Cross-refs:** `19-data-and-worker-architecture.md` (worker durumu, cost-aggregation, model-health-check, data-expiry), `16-openrouter-routing.md` §6 (nightly drift), `22-cost-model.md` (maliyet paneli detay), `05-event-contracts.md` (event izleri), `21-security-and-compliance.md` (redaction, HITL denetim izi).
