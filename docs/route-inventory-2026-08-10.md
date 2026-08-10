# Rota Envanteri — 2026-08-10

Kapsam: `src/app` altındaki **26 sayfa rotası** ve **103 API rotası**. (`npm run build` çıktısındaki ~86 "statik sayfa" sayısı, dinamik segmentlerin ön-üretilmiş varyantlarını da sayar; kanonik rota sayısı 26'dır.)

**Yöntem — kullanım kanıtı hakkında dürüst not.** Bu projede ürün analitiği yok. "Son 30 gün kullanım" ölçülemedi. Onun yerine ölçülebilir iki sinyal kullanıldı:

1. **Menü görünürlüğü** — `src/components/layout/Sidebar.tsx` içindeki `topItemsFor()` + `NAV_GROUPS` + `SYSTEM_ITEMS`.
2. **Gelen referans sayısı** — `src` altında `'/rota'` biçiminde geçen dosya sayısı. `AppLayout.tsx` her rotayı sayfa-başlığı haritasında taşıdığı için **her rota en az 1 referans alır**; gerçek sinyal `AppLayout` dışındaki referanslardır.

Kullanım verisi olmadan **hiçbir rota silinmez**. Varsayılan eylem arşivleme/gizlemedir; silme kullanıcı onayına bağlıdır.

---

## Sayfa rotaları

| Rota | Menüde | Ref (AppLayout hariç) | Sahip | Sınıf | Gerekçe |
|---|---|---|---|---|---|
| `/` | — | 1 (`proxy.ts`) | AgencyOS | **KEEP** | `/command-center`'a yönlendirir. |
| `/login` | — | 1 | AgencyOS | **KEEP** | Google Workspace girişi. |
| `/command-center` | ✅ üst | 9 | AgencyOS | **KEEP** | Giriş yüzeyi; en çok referans alan rota. |
| `/bugun` | ✅ üst | 6 | AgencyOS | **KEEP** | Günlük satış/karar akışı; Telegram komutları da buraya bağlı. |
| `/harita` | ✅ MÜŞTERİ | 2 | AgencyOS | **KEEP** | Lead Radar — Faz 2'de birleşik hesap görünümüne dönüşür. |
| `/firsatlar` | ✅ MÜŞTERİ | 2 | AgencyOS | **MERGE → `/harita`** | Aynı veri kümesinin ikinci görünümü. Günlük fırsat listesi, Lead Radar'ın "Bugünün fırsatları" sekmesi olur. Rota korunur, yönlendirilir. |
| `/pipeline` | ✅ MÜŞTERİ | 6 | AgencyOS | **KEEP** | Kanban; lifecycle projeksiyonunun ana tüketicisi. |
| `/experiments` | ✅ MÜŞTERİ | 1 (Sidebar) | AgencyOS | **KEEP** | Salt-okunur deney kokpiti. Menüde kalır ama ikincil. |
| `/projects` | ✅ MÜŞTERİ | 1 (Sidebar) | AgencyOS | **KEEP** | Onboarding/teslimat yüzeyi — Faz 2'de lifecycle `onboarded→case_produced` buraya bağlanır. |
| `/kariyer` | ❌ menüden çıktı | 0 | **GrafikcemOS** | **MOVE (uygulandı)** | Veri okumayan "geçiş hazırlanıyor" ekranı. Arayüz `src/components/career/legacy/`'ye arşivlendi. |
| `/gelisim` | ❌ menüden çıktı | 0 | **GrafikcemOS** | **MOVE (uygulandı)** | Veri okumayan "geçiş hazırlanıyor" ekranı. `src/components/growth/*` devir için korundu. |
| `/belgeler` | ✅ MÜŞTERİ | 1 (Sidebar) | AgencyOS | **YENİ** | TR + Global belge merkezi, versiyonlu fiyat kapısı. |
| `/services` | ✅ ARAÇLAR | 1 (Sidebar) | AgencyOS | **KEEP** | Teklif/hizmet kataloğu; niş teklif merdiveninin tüketicisi. |
| `/asistan` | ✅ ARAÇLAR | 1 (Sidebar) | AgencyOS | **KEEP** | Jarvis yüzeyi. |
| `/settings` | ✅ SİSTEM | 2 | AgencyOS | **KEEP** | Gmail OAuth callback buraya döner. |
| `/finans` | ❌ | 4 | **GrafikcemOS** | **MOVE** | Kişisel finans. Menüden düştü; rota her zaman "taşındı" ekranı döndürür. Telegram komut ayrıştırıcısı referansı korunur. |
| `/aliskanliklar` | ❌ | 4 | **GrafikcemOS** | **MOVE** | Menüde görünmez; eski deep-link her zaman "taşındı" ekranına düşer. |
| `/gorevler` | ❌ | 2 | **GrafikcemOS** | **MOVE** | Aynı. |
| `/akademi` | ❌ | 1 (`academyActions`) | **GrafikcemOS** | **MOVE** | Kişisel eğitim takibi. Rota ve veri korunur. |
| `/kutuphane` | ❌ | 0 | **GrafikcemOS** | **MOVE** | Kişisel kitaplık. |
| `/konsol` | ❌ | 1 (`LeadDrawer`) | AgencyOS | **HIDE** | Operatör admin yüzeyi (registry/onay/run). Menüde olmamalı, çalışır kalmalı. |
| `/schedule` | ❌ | 0 | AgencyOS | **HIDE** | Cron manifest görüntüleyici. Kanonik manifest'ten türüyor, doğru çalışıyor. |
| `/agents` | ❌ | 0 | AgencyOS | **HIDE** | Ajan operasyon yüzeyi. Faz 4'te ortak ajan görünürlüğü tasarımının girdisi. |
| `/tasks` | ❌ | 2 | AgencyOS | **HIDE** | Ajan görev kuyruğu; `CommandCenterClient` ve `DirectiveResultModal` derin link veriyor. |
| `/bilgi` | ❌ | 0 | AgencyOS | **HIDE** | Bilgi deposu arayüzü. |
| `/dashboard` | ❌ | 0 | AgencyOS | **KEEP (6 satır)** | Yalnız `redirect('/command-center')`. Eski deep-link'leri kırmamak için kalır; maliyeti yok. |
| `/icraat-firsatlari` | ❌ | 0 | AgencyOS | **ARŞİV — silme onayı bekliyor** | **`MOCK_OPPORTUNITIES` ile çalışıyor** (`src/lib/opportunities`). 383 satır, gerçek veri yok, hiçbir yerden linklenmiyor. Ürün yüzeyi olarak yanıltıcı. Varsayılan: menüden zaten yok, `docs/archive/` altına taşınması önerilir. **Silme kullanıcı kararı.** |

### Menü sonucu (Faz 3.1'de uygulanır)

```
ÜST      Ana Merkez · Bugün
MÜŞTERİ  Lead Radar · Pipeline · Deneyler · Projeler · Hizmetlerim
KARİYER  Kariyer Radarı · Gelişim
ARAÇLAR  Asistan
SİSTEM   Ayarlar
```

`YAŞAM` grubu tamamen kalkar. `Fırsatlar` Lead Radar'a girer. Birincil işe (bugün kime ne gönderilecek) adım sayısı: **Ana Merkez → Lead Radar → satır = 3**.

---

## API rotaları (103)

| Grup | # | Sahip | Sınıf | Not |
|---|---|---|---|---|
| `/api/leads` | 16 | AgencyOS | KEEP | Faz 1-2'nin ana yüzeyi. `[id]/{action,audit,cold-email,contacts,convert,feedback,proposal,risk,sequence}` |
| `/api/integrations` | 12 | Köprü | KEEP | `cemos/life/*` (9), `cemos/growth/*` (2), `feed-the-goat/snapshot` (1). Faz 5'te genişler. |
| `/api/cron` | 10 | AgencyOS | KEEP | Kanonik manifest'e bağlı, parity testi var. |
| `/api/outreach` | 7 | AgencyOS | KEEP | Onay→gönderim tek çıkış noktası. |
| `/api/gmail` | 5 | AgencyOS | KEEP | OAuth + vault + canary. |
| `/api/telegram` | 5 | AgencyOS | KEEP | 5 rota (`route,setup,health,diag,diagnostics`) — `diag` ve `diagnostics` **MERGE adayı**. |
| `/api/jobs` | 4 | AgencyOS | KEEP | Kariyer Radarı motoru; Faz 3.2'de telemetri eklenir. |
| `/api/auth` | 4 | AgencyOS | KEEP | |
| `/api/ai` | 4 | AgencyOS | KEEP | |
| `/api/{admin,agents}` | 6 | AgencyOS | HIDE-eşlik | Gizlenen sayfaların arka ucu; korunur. |
| `/api/{approvals,jarvis,memory,metrics,orchestrator,runs,services}` | 14 | AgencyOS | KEEP | |
| tekil (18 rota) | 18 | AgencyOS | KEEP | `enrichment/apollo`, `person-leads/scan`, `outbound/gate`, `proposals/[id]`, `sectors/opportunities`, `opportunities/signals`, `voice-dna`, `voice/samples`, `flags`, `health/config`, `knowledge`, `council`, `registry`, `db/[table]`, `tasks`, `assistant/settings` |

**Tespit edilen tek gerçek tekrar:** `/api/telegram/diag` + `/api/telegram/diagnostics`. İkisi de teşhis döndürüyor. Bu turda **birleştirilmedi** — Telegram teslim zinciri %85-90 kapsam eşiğine bağlı ve bu tur kapsamı dışında. Not olarak kayda geçti.

---

## Bu turda uygulanan / uygulanmayan

**Güncelleme 2026-08-10 (ikinci tur):** kariyer rotaları GrafikcemOS'a devredildi (`docs/CAREER-HANDOFF-2026-08-10.md`), `/belgeler` eklendi, Lead Radar Türkiye/Global çalışma alanına ayrıldı.

**Uygulanır (Faz 3.1 + Faz 4):** menü yeniden gruplama · `/gelisim` route taşıma · `/firsatlar` → Lead Radar sekmesi · `MOVE` sınıfı yaşam rotalarının "taşındı" ekranına bağlanması · `HIDE` sınıfının menüde olmadığının doğrulanması.

**Kullanıcı onayı bekliyor:** `/icraat-firsatlari` arşivleme veya silme · `/api/telegram/diag` + `diagnostics` birleştirme.

**Yapılmaz:** hiçbir rota dosyası silinmez, hiçbir veri düşürülmez.
