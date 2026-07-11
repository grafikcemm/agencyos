# AgencyOS V2 — Sprint 0/1 Kodlama Başlatma Prompt'u

> Bu dosya yeni (sıfır-context) bir Claude Code oturumuna yapıştırılacak prompt'tur.
> Kaynak: `IMPLEMENTATION-HANDOFF.md` + `FIRST-SPRINT.md` (2026-07-11 planlama suiti).

---

AgencyOS V2 Sprint 0/1 kodlamasını başlat. Kusursuz, faz faz, her fazı Playwright ile doğrulaya doğrulaya ilerle. Bir faz DOĞRULANMADAN sonraki faza GEÇME.

## 0. Önce oku (sırayla, kod yazmadan)

1. `docs/agencyos-v2-planning/IMPLEMENTATION-HANDOFF.md` — dokunulacak/dokunulmayacak dosyalar, rol prompt'ları, DoD
2. `docs/agencyos-v2-planning/FIRST-SPRINT.md` — görev listesi, kabul kriterleri, rollback
3. `docs/agencyos-v2-planning/16-openrouter-routing.md` — preset tasarımı (Faz 1'in spec'i)
4. `docs/agencyos-v2-planning/12-gmail-and-followup-engine.md` — Gmail L2 + follow-up FSM (Faz 4-5 spec'i)
5. `docs/agencyos-v2-planning/26-acceptance-tests.md` — Senaryo 2/5/6 (bu sprintin test hedefleri)
6. `docs/agencyos-v2-planning/04-domain-model.md` + `19-data-and-worker-architecture.md` — şema/migration sözleşmesi

## 1. Sert kurallar (pazarlıksız)

- **LIFE DB'ye ve `src/app/(os)/(life)/*`, `src/lib/assistant/*`, `src/lib/habits/*`, `src/lib/activeTasks.ts`, `src/lib/dailyRoutines.ts` dosyalarına DOKUNMA.** Görev/Alışkanlık/Rutin sistemi bozulamaz.
- Migration'lar SADECE App DB'ye (dfedeh…), SADECE additive, SADECE `supabase/migrations/` altına dosya olarak. **Uygulamadan önce canlı `list_migrations`/`list_tables` doğrula** (repo≠canlı drift riski). `prisma db push` / doğrudan prod şema değişikliği YASAK.
- **HITL:** onaysız hiçbir gerçek e-posta gönderimi kodu yazma. `send-gmail` her zaman `approval_requests` digest-lock (mig 043) arkasında. Suppression pre-send kapısı atlanamaz.
- Secrets asla koda/loga/rapora yazılmaz — sadece env değişken ADI.
- Model ID'leri tek yerde (yeni preset registry). `deepseek-v4-pro`, `gemini-2.5-flash-lite`, `claude-haiku-4-5` ÖLÜ — hiçbir yeni kodda kullanma.
- Küçük, geri alınabilir commit'ler; faz başına en az bir commit. `main`'e push YOK; branch: `feat/agencyos-v2-sprint0`.
- Plan dışına çıkma: yeni fikirler "later" listesine, diff'e değil.

## 2. Faz-kapı disiplini (her fazda aynı döngü)

Her faz şu sırayla kapanır, kapanmadan sonraki faz AÇILMAZ:

```
implement → tsc --noEmit → lint → vitest (etkilenen + tüm suite) → next build
→ run-local ile dev server ayağa kaldır
→ Playwright MCP ile GERÇEK UI akışını sür (tıkla, doldur, doğrula — sadece sayfa açmak yetmez)
→ ekran görüntüsü kanıtı al (faz başına ≥1, before/after varsa ikisi)
→ sonuçları OLDUĞU GİBİ raporla (başarısızlık varsa aynen aktar, geçiştirme)
→ commit
```

Test kırmızıysa: düzelt, testi değil implementasyonu değiştir (test yanlış değilse). Doğrulanamayan bir şey varsa NEDENİNİ açıkça yaz.

## 3. Fazlar (FIRST-SPRINT görev sırası)

### Faz 0 — Hazırlık (kod yok)
- Dirty working tree kontrolü; `git worktree add` ile `feat/agencyos-v2-sprint0` aç.
- Canlı OpenRouter `/api/v1/models` fetch et → 16-routing'deki 7 preset modelinin hâlâ mevcut olduğunu doğrula; drift varsa raporla ve preset tablosunu güncelleyerek ilerle.
- Canlı `list_migrations` → sıradaki boş numaranın 045 olduğunu doğrula.
- Gmail OAuth durumunu kontrol et: **kullanıcı yetkilendirmediyse dur ve bildir** — Faz 4'ü `GMAIL_SEND_ENABLED=false` bayrağı arkasında dry-run modda kodla, gerçek gönderimi kullanıcı yetkilendirene kadar mock'la.
- **Kapı:** rapor (drift/migration/OAuth durumu) → sonra Faz 1.

### Faz 1 — Model routing ACİL fix (`src/lib/openrouter.ts` + yeni `src/lib/models/`)
- 16-routing §3-5'e birebir: `PRESETS` registry (yeni dosya `src/lib/models/presets.ts`), `models:[primary,...fallbacks]` self-heal, AbortController timeout, 1 retry, görünür fallback logu (`model.fallback.used`), price ceiling.
- `OPERATION_MODEL_MAP` → `OPERATION_PRESET_MAP`; `callWithOperation`/`callLight/Medium/Heavy` imzaları KIRILMAZ (mevcut çağıranlar aynen çalışır).
- Ölü 3 ID tüm kod yollarından temizlenir; `TOKEN_RATES_PER_M` canlı fiyatlarla güncellenir.
- **Playwright doğrulama:** `/firsatlar` veya `/harita` üzerinden bir lead'e AI analizi tetikle → cevap geliyor, `ai_cost_logs`a doğru model yazılıyor, konsolda 4xx/5xx yok.

### Faz 2 — Contracts + feature flags + audit temeli
- Feature flag'ler: `GMAIL_SEND_ENABLED`, `FOLLOWUP_FSM_ENABLED` (default false); mevcut `BRAIN_V2_ENABLED`/`BRAIN_ACTIVE_ENABLED` OFF kalır.
- Audit: mevcut `run_spans` + `approval_requests` üzerine; `redact.ts`'e OAuth token pattern'leri ekle.
- **Playwright doğrulama:** `/konsol` veya `/settings` yüzeyinde flag durumları görünür/okunur; uygulama regresyonsuz açılıyor (smoke: 5 ana sayfa gezintisi).

### Faz 3 — Migration'lar 046 + 047 + 052 (045 bu sprintte ERTELENDİ)
- 046: `email_threads`, `email_messages`, `outreach_messages`'a additive kolonlar (`original_body`, `final_body`, `gmail_message_id`, `gmail_thread_id`), `gmail_accounts`.
- 047: `suppression_list`, `consent_records`, `leads.do_not_contact*`, `retention_until`.
- 052: `tool_cost_logs` (Google Places loglama dahil — `scan.ts` çağrılarını logla).
- SQL dosyaları idempotent (IF NOT EXISTS); kullanıcıya SQL Editor'da elle uygulatmak için net talimat + doğrulama sorgusu ver; MCP `apply_migration` KULLANMADAN ÖNCE kullanıcıdan onay iste.
- **Playwright doğrulama:** migration sonrası app regresyonsuz; lead drawer açılıyor; Places log satırı `tool_cost_logs`a düşüyor.

### Faz 4 — Gmail L2 send çekirdeği (`src/lib/outreach/gmail.ts` yeni)
- Scope SADECE `gmail.send` + `gmail.readonly`. `googleapis` bağımlılığı (tek satır gerekçeyle).
- Akış: taslak (uygulama-içi) → `audit-compliance` deterministik kapı (footer/opt-out/**suppression kontrolü 047'den**) → HITL onay (`approval_requests` digest-lock) → send → `markMessageSent` (mevcut idempotency yeniden kullan) → thread/message satırları 046'ya.
- Duplicate-send yapısal imkânsız: `outreach_messages.id` idempotency + `sent_at` no-op.
- OAuth yoksa: dry-run modda tam akış (send yerine mock, geri kalan her şey gerçek).
- **Playwright doğrulama (Senaryo 2+5+6, doc 26):** taslak üret → düzenle → onayla → (dry-run/gerçek) gönder → aynı taslak ikinci kez GÖNDERİLEMİYOR → suppression'a eklenmiş lead için taslak/gönderim BLOKE → primary model çökünce fallback devreye giriyor ve kullanıcıya düzgün hata.

### Faz 5 — Sprint kapanışı
- Tüm suite: tsc + lint + vitest (tamamı) + build + Playwright smoke (5 ana sayfa + outreach akışı uçtan uca).
- Kabul kriterleri kontrol listesi: FIRST-SPRINT'teki 10 AC tek tek işaretle, kanıtla (test adı / ekran görüntüsü).
- Doğrulanamayanları AÇIKÇA listele.
- `/create-handoff` ile handoff yaz (`docs/handoffs/`), commit'le. Push için kullanıcıdan onay iste.

## 4. Raporlama biçimi

Her faz sonunda kısa blok:

```
FAZ N: <ad>
Durum: TAMAM / KISMEN (neden)
Testler: tsc ✓/✗ · lint ✓/✗ · vitest X/Y · build ✓/✗
Playwright: <sürülen akış> → ✓/✗ (ekran görüntüsü: <dosya>)
Commit: <hash> <mesaj>
Doğrulanamayan: <varsa>
```

Başla: Faz 0.
