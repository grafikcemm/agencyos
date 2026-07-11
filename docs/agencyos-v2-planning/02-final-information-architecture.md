---
Doküman: 02-final-information-architecture
Dalga: 2 (Motorlar)
Tarih: 2026-07-11
Durum: Nihai bilgi mimarisi (nav recompose kaynağı)
Bağımlılık: plan §4 (nav recompose), rules/os/70 (simplify-before-adding); Sidebar.tsx, route glob (23 sayfa); research 02 §2/§6
---

# AgencyOS V2 — Nihai Bilgi Mimarisi (KEEP / MERGE / MOVE / HIDE / DELETE)

## 0. İlke

Yeni yüzey **son çare** (rules/os/70). Bu doküman her mevcut route'u sınıflar; hiçbir yeni ekran icat etmez — plan §4 nav recompose'u uygular: **BUGÜN** (tek kokpit), **PIPELINE** (derinlik, sadeleşmiş), **SİSTEM** (teknik yüzeyler), **TOP+YAŞAM** (dokunulmaz). Verdict sözlüğü:

- **KEEP** — route + nav yeri korunur (dokunulmaz veya zaten doğru).
- **MERGE** — işlevi başka yüzeye gömülür; sayfa arşiv/ikincil role iner (silinmez).
- **MOVE** — route aynı, sidebar grubu değişir.
- **HIDE** — route kod olarak kalır ama günlük nav'dan çıkarılır (mock/olgunlaşmamış).
- **DELETE** — orphan/ölü route, güvenle kaldırılır.

## 1. Mevcut route envanteri (glob = 23 `page.tsx`)

Kaynak: `src/app/**/page.tsx` + `Sidebar.tsx` grupları (`TOP_ITEMS:31-34`, `NAV_GROUPS:36-67`, `SYSTEM_ITEMS:70-74`).

| Route | Bugünkü nav yeri | Verdict | V2 yeri | Gerekçe (grounded) |
|---|---|---|---|---|
| `/aliskanliklar` | TOP `:32` | **KEEP** | TOP (değişmez) | Yaşam katmanı, LIFE DB, dokunulmaz (plan §4; 04 §E). En kritik günlük yüzey. |
| `/gorevler` | TOP `:33` | **KEEP** | TOP (değişmez) | Aynı — Aktif Görevler, LIFE DB `active_tasks`, satıştan kasıtlı ayrı (04 §E). |
| `/gelisim` | YAŞAM `:40` | **KEEP** | YAŞAM | Yaşam katmanı; satış recompose'una dahil değil. |
| `/akademi` | YAŞAM `:41` | **KEEP** | YAŞAM | Aynı (LIFE, tek-Beykent aracı, memory). |
| `/kutuphane` | YAŞAM `:42` | **KEEP** | YAŞAM | Yaşam katmanı. |
| `/finans` | YAŞAM `:43` | **KEEP** | YAŞAM | Yaşam katmanı. |
| `/command-center` | KOMUTA `:49` | **KEEP (recompose)** | **BUGÜN** (tek kokpit) | Zaten günlük brief iskeleti (`page.tsx:99-217`); yaşam bloğu çıkar, fırsat/follow-up/riskli şeritleri gömülür (01 §2, research 02 §2). Yeni sayfa DEĞİL. |
| `/firsatlar` | PIPELINE `:59` | **MERGE** | PIPELINE (arşiv) | 2 fırsat kartı BUGÜN'e taşınır; sayfa "tüm geçmiş fırsatlar + filtre" arşivine iner, silinmez (research 02 §2). |
| `/harita` | PIPELINE `:58` | **KEEP** | PIPELINE (Lead Radar) | Coğrafi keşif + tarama tetikleme, derin ayrı işlev; kokpit yalnız özet bağlar. Ayrıca `/` redirect hedefi (`page.tsx:4`). |
| `/pipeline` | PIPELINE `:60` | **KEEP** | PIPELINE | Kanban 6 kolon (new→contacted→responded→meeting→proposal→converted) — zaten doğru ölçek, KORU (research 02 §4). Yeni aşama eklenmez. |
| `/projects` | PIPELINE `:61` | **KEEP** | PIPELINE (Projeler) | Kazanılan iş = `projects` (04 Opportunity); pipeline derinliğinin parçası. |
| `/services` | PIPELINE `:62` | **KEEP** | PIPELINE (Hizmetlerim) | Service Library override paneli (`service_catalog`, mig 032); offer motoru bağımlısı. |
| `/icraat-firsatlari` | PIPELINE `:63` | **HIDE** | (nav'dan çıkar) | **MOCK** — `MOCK_OPPORTUNITIES` (`icraat-firsatlari/page.tsx:6`); gerçek veri değil. Kod kalır, günlük nav'dan çekilir (plan §4). |
| `/kariyer` | PIPELINE `:64` | **KEEP (out-of-suite)** | Ayrı (PIPELINE'dan çıkar) | Kariyer job engine (ATS ilanları, mig 011) — satış suit'i DIŞI (04 Job notu). Satış PIPELINE'ından ayrıştırılır; işlev korunur. |
| `/agents` | KOMUTA `:51` | **MOVE** | **SİSTEM** (Ajanlar) | Ajan sohbeti+telemetri = mühendislik yüzeyi; birincil görevle aynı öncelikte olmamalı (≤3 adım, rules/os/70; research 02 §6). |
| `/konsol` | KOMUTA `:52` | **MOVE** | **SİSTEM** (Konsol) | Registry sayaç + HITL onay kartları + run geçmişi = sistem sağlığı; SİSTEM'e taşınır. HITL sayısı BUGÜN'e **sayaç** olarak sızdırılır (research 02 §6). |
| `/asistan` | KOMUTA `:50` | **KEEP** | KOMUTA/BUGÜN yanı | Mentor asistanı (DailyBriefCard kaynağı); günlük üst-seviye yüzey, korunur. |
| `/schedule` | SİSTEM `:71` | **KEEP** | SİSTEM (Workers/Zamanlanmış) | Cron/worker görünürlüğü; plan §4 SİSTEM'de "Workers". |
| `/bilgi` | SİSTEM `:72` | **KEEP** | SİSTEM (Bilgi Hazinesi) | Knowledge base; SİSTEM'de kalır. |
| `/settings` | SİSTEM `:73` | **KEEP** | SİSTEM (Ayarlar) | Ayarlar; SİSTEM'de kalır. |
| `/dashboard` | **nav'da YOK** | **DELETE** | — | Orphan: sidebar'da yok, canlı sayfa ama erişilemez (`dashboard/page.tsx` real ama link yok; research 02 §Özet ölü kod). Plan §4 açık: DELETE. |
| `/tasks` | **nav'da YOK** | **DELETE** | — | Orphan: `agent_tasks` kuyruk kanban'ı (`tasks/page.tsx:50` `/api/tasks`), sidebar'da yok. İşlevi SİSTEM/Workers + Konsol run geçmişiyle örtüşür → DELETE (plan §4). |
| `/` (root) | (redirect) | **KEEP** | redirect hedefi | `redirect('/harita')` (`page.tsx:4`); recompose fazında BUGÜN'e çevrilmesi ürün kararı (`assumption:`, 01 §7). |

**Özet sayım:** KEEP 15, MERGE 1 (`/firsatlar`), MOVE 2 (`/agents`, `/konsol`), HIDE 1 (`/icraat-firsatlari`), DELETE 2 (`/dashboard`, `/tasks`).

## 2. V2 nav grupları (hedef sidebar)

```
TOP (dokunulmaz)
  Alışkanlıklar        /aliskanliklar   KEEP
  Aktif Görevler       /gorevler        KEEP

BUGÜN (yeni kokpit rolü — /command-center recompose)
  Bugün                /command-center  KEEP(recompose)
  Asistan              /asistan         KEEP

PIPELINE (derinlik, sadeleşmiş — plan §4)
  Lead Radar           /harita          KEEP
  Pipeline             /pipeline        KEEP (6 kolon)
  Bugünün Fırsatları   /firsatlar       MERGE (arşiv)
  Projeler             /projects        KEEP
  Hizmetlerim          /services        KEEP

YAŞAM (dokunulmaz)
  Gelişim /gelisim · Akademi /akademi · Kütüphane /kutuphane · Finans /finans   KEEP

SİSTEM (teknik yüzeyler toplanır — plan §4)
  Ajanlar    /agents    MOVE      |  Konsol   /konsol    MOVE
  Modeller   (NEW)      |  Gmail   (NEW)  |  Workers  /schedule KEEP
  Costs      (NEW)      |  Logs    (NEW)  |  Compliance (NEW)
  Ayarlar    /settings  KEEP      |  Bilgi Hazinesi /bilgi KEEP

Nav DIŞI / ayrı:
  Kariyer Radarı  /kariyer          KEEP (out-of-suite job engine)
  İcraat Fırsatları /icraat-firsatlari  HIDE (mock)
  /dashboard, /tasks                DELETE (orphan)
```

## 3. SİSTEM grubunun YENİ yüzeyleri (plan §4 — bu fazda route YOK)

Plan §4 SİSTEM'i şu 9 öğeyle listeler: Ajanlar, Konsol, Modeller, Gmail, Workers, Costs, Logs, Compliance, Ayarlar. Bunlardan 4'ü mevcut route (Ajanlar/Konsol MOVE, Workers=`/schedule`/`/bilgi`, Ayarlar KEEP); **5'i net-new yüzey (Modeller, Gmail, Costs, Logs, Compliance)** — bunlar bu planlama fazında **route açmaz**, ilgili motor dokümanlarına bağlıdır:

| Yeni SİSTEM yüzeyi | Besleyen entity/motor | Doküman |
|---|---|---|
| Modeller | Model Registry preset katalog | 16-openrouter-routing |
| Gmail | OAuth durumu + thread sync sağlığı (mig 046) | 12-gmail-and-followup-engine |
| Costs | `ai_cost_logs` (mig 014/039) + `tool_cost_logs` (mig 052) | 22-cost-model |
| Logs | `run_spans` (mig 044, redacted) | 20-observability-and-analytics |
| Compliance | `suppression_list`/`consent_records` (mig 047) + deliverability | 21-security-and-compliance |

**Anti-bloat notu:** bu 5 yüzey ayrı ekran değil, çoğu SİSTEM içinde sekme/panel olarak kompoze edilebilir (kullanıcı analytics vs sistem sağlığı ayrımı, 20-observability). Teknik metrikler BUGÜN kokpitine yığılmaz (research 02 §6/§7).

## 4. Bildirim ve mobil (nav bileşenleri)

- **Header zili** (`AppLayout.tsx`) bugün dekoratif (statik nokta). V2: ya gerçek 3-kaynak sayaca bağla (HITL onay + geciken follow-up + yeni yanıt) ya da kaldırıp tek kanal Telegram'ı bırak — iki yarım-bildirim tutma (research 02 §7). Bu bir nav-katmanı kararı, yeni route değil.
- **Mobil:** BUGÜN üst şeridi (6 sayaç) + lead kartında 3 büyük buton (Ara/WhatsApp/Durum — dropdown, sürükleme yok). `/pipeline` kanban + `/harita` masaüstü-öncelikli kalır (research 02 §8). Nav yapısı değişmez.

## 5. Ölü kod temizliği (IA kararının kod sonucu — ayrı görev)

DELETE/HIDE verdict'leri şu dosyaları etkiler (research 02 §Özet + §Entegrasyon); **silme ayrı, düşük-riskli cleanup görevidir**, bu doküman yalnız işaret eder:
- DELETE: `app/(os)/dashboard/page.tsx` + `RightPanel.tsx` + `UrgentLeadsWidget.tsx` + `AICostWidget.tsx`; `app/(os)/tasks/page.tsx`; `KanbanBoard.tsx` + `LeadModal.tsx` (hiçbir route render etmiyor).
- **Yeniden kullan (silme):** `FollowUpWidget.tsx` — sorgusu doğru, BUGÜN follow-up şeridine bağlanır.
- HIDE: `icraat-firsatlari/page.tsx` + `MOCK_OPPORTUNITIES` — kod kalır, nav'dan çıkar.

## 6. Doğrulanamayanlar (`assumption:`)

- `leads.status='waiting'` gerçekten kullanılıyor mu — DB sayımı gerekli; kullanılmıyorsa `responded`'a birleştir (research 02 §4/§Açık sorular). Bu IA'yı değiştirmez (kanban zaten 6 kolon).
- `/` landing'in BUGÜN'e çevrilmesi ürün kararı; bugün `/harita` (`page.tsx:4`).
