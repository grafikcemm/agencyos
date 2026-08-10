# Kariyer devri — AgencyOS → GrafikcemOS Kariyer Ajanı

Tarih: 2026-08-10. Karar sahibi: kullanıcı. Durum: **AgencyOS tarafı temizlendi, veri taşınmadı.**

## Karar

`/kariyer` (Kariyer Radarı) ve `/gelisim` (kariyer/gelişim rotası) **AgencyOS kapsamı değildir**.
AgencyOS yalnız ajansın gelir ve müşteri edinim işletim sistemidir. İş arama, başvuru, yetkinlik
gelişimi ve kişisel öğrenme rotası GrafikcemOS Kariyer Ajanı'nın sahipliğindedir.

Bu karar, 2026-08-10 sabahındaki "kariyer AgencyOS'a aittir" kararının **üzerindedir** ve onu geçersiz kılar.

## AgencyOS tarafında bu turda yapılanlar

| İş | Durum |
|---|---|
| `/kariyer` ve `/gelisim` veri okumayan "geçiş hazırlanıyor" ekranı döner | ✅ |
| Sidebar `KARİYER` grubu kaldırıldı | ✅ |
| `readOperationalSummary()` içinden `careerAction` ve `career_state` okuması kaldırıldı | ✅ |
| Kariyer Radarı arayüzü `src/components/career/legacy/KariyerRadarClient.tsx`'e taşındı (git geçmişi korunur, rotaya bağlı değil) | ✅ |
| Career verisi silindi | ❌ **Hayır — silinmedi, silinmeyecek** |
| Canlı migration uygulandı | ❌ **Hayır** |
| GrafikcemOS kariyer arayüzü yazıldı | ❌ Bu turun kapsamı değil |

## Devredilecek yüzey — tam envanter

### Rotalar (AgencyOS'ta artık taşındı-ekranı)

- `/kariyer` — dış ilan radarı
- `/gelisim` — gelişim rotası ve yetkinlik haritası

### API rotaları (hâlâ çalışıyor, devirden sonra kapatılacak)

| Rota | İş |
|---|---|
| `GET /api/jobs` | ilan listesi |
| `POST /api/jobs/scan` | tarama tetikleme, `ScanStats` döner |
| `POST /api/jobs/ingest` | tekil ilan URL'i alma |
| `POST /api/jobs/[id]/draft` | başvuru taslağı üretimi |
| `GET /api/cron/job-scan` | zamanlanmış tarama (`CRON_SECRET`) |

### Kod modülleri

```
src/lib/jobs/            scan.ts · filter.ts · scoring.ts · pipeline.ts · types.ts · providers/firecrawl.ts
src/lib/career/          cockpit.ts · evidenceFetch.ts (+ testleri)
src/data/                careerRoadmap.ts · careerRoute.ts
src/hooks/               useCareerState.ts
src/app/actions/         careerActions.ts
src/components/growth/   GrowthPage · FocusHero · SkillCard · SkillTracks · SkillDetailDrawer ·
                         GrowthLadderHero · FocusResourcesPanel · KnowledgeStatusSelector ·
                         ResourceLink · ArchivedCareerItems
src/components/career/legacy/KariyerRadarClient.tsx   (arşiv, rotaya bağlı değil)
```

### Veri — tablo sahipliği

| Tablo | Bulunduğu DB | Devir |
|---|---|---|
| `job_listings` | App DB (`supabase/migrations/011_job_engine.sql`, `023_job_reject.sql`) | export → GrafikcemOS |
| `job_application_drafts` | App DB (011) | export → GrafikcemOS |
| `career_state` | App DB | export → GrafikcemOS |
| `career_skills` | App DB | export → GrafikcemOS |
| `career_evidence` / `career_evidence_links` | **hiçbir yerde yok** — `supabase/life-migrations/008_career_evidence.sql` **uygulanmadı** | migration dosyası GrafikcemOS'a devredilir, AgencyOS'ta **uygulanmaz** |

> `supabase/life-migrations/008_career_evidence.sql` AgencyOS canlı şemasına **uygulanmamalıdır**.
> Dosya, hedef sahiplik GrafikcemOS olduğu için repoda kanıt olarak bırakıldı; uygulanma yeri GrafikcemOS'un
> kendi finalizasyonudur. Rollback ikizi mevcuttur.

### B2B `person_leads` KARIŞTIRILMAZ

`person_leads` (Apollo karar vericileri) **satış** verisidir, kariyer verisi değildir. Devirde
taşınmaz. Ayrım kesin:

| Kavram | Tablo | Sahip |
|---|---|---|
| Satın alma kararı veren kişi (CMO, marka müdürü) | `person_leads`, `contacts` | AgencyOS |
| İş ilanı ve başvuru adayı (Ali Cem'in kendisi) | `job_listings`, `job_application_drafts` | GrafikcemOS |

### Köprü sözleşmesi değişikliği

`GET /api/integrations/cemos/growth/snapshot` artık `operations.careerAction` **üretmez**.
GrafikcemOS istemcisi bu alanı okuyorsa kaldırmalıdır; alan yokluğu hata değil, sözleşme değişikliğidir.
Regresyon testi: `src/lib/growth/growthBridge.test.ts` → "operasyon özeti kariyer alanı ÜRETMEZ".

## Devir için gereken export/import manifesti

AgencyOS tarafında **veri silinmez**. GrafikcemOS finalizasyonu şunu yapmalıdır:

1. App DB'den `job_listings`, `job_application_drafts`, `career_state`, `career_skills` tablolarını
   satır bazında export et (JSONL + satır sayısı + SHA-256 manifest).
2. GrafikcemOS'un kendi DB'sinde aynı şemayı `supabase/migrations/011_job_engine.sql` ve `023_job_reject.sql`
   içeriğinden türet; kaynak `id`'leri `source_system='agencyos'` provenance alanıyla koru.
3. İçe alma doğrulandıktan sonra AgencyOS tarafında **arşivle** (tablo bırakılır, API rotaları kapatılır).
   Silme ayrı ve sonraki bir karardır.
4. Geri dönüş planı: içe alma başarısızsa AgencyOS tarafında hiçbir şey değişmediği için rollback
   yalnız GrafikcemOS tarafında tabloları düşürmektir.

## Kalan bağımlılık

- `job-scan` cron'u AgencyOS'ta hâlâ tanımlı. Devir tamamlanana kadar çalışmaya devam eder
  (veri toplamayı durdurmak, devirde eksik veri demektir). Kapatma kararı devirden sonra.
- GrafikcemOS Kariyer Ajanı arayüzü bu turda yazılmadı; bu belge o işin girdisidir.
