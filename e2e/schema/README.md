# E2E Test DB Şeması — Parity & Drift

## Ne var burada

| Dosya | İçerik |
|---|---|
| `e2e-schema.sql` | App DB'nin (dfedeh…) pg_catalog'undan deterministik çıkarılmış TAM şema: 60 tablo, tüm constraint/index/fonksiyon/trigger + RLS. Test projesine (**agencyos-e2e / luhvfbujwnlnpnoelzhg**) uygulanır. |
| `expected-fingerprint.json` | App DB'den alınmış kanonik fingerprint (tablo başına md5 + functions/triggers md5). Drift testinin referansı. |

Drift testi: `e2e/schema-drift.spec.ts` — test DB'deki `e2e_schema_fingerprint()` RPC çıktısını `expected-fingerprint.json` ile karşılaştırır. Kapsam: tablolar, kolonlar (ad/tip/notnull/default/identity), PK/UNIQUE/CHECK/FK constraint tanımları, constraint-dışı indexler, public fonksiyon tanımları, triggerlar, RLS enabled bayrağı.

## Bilinçli sapmalar (fingerprint DIŞI — testte karşılaştırılmaz)

1. **Policy'ler**: App DB'de policy yok (service-role-only erişim). Test DB'de her tabloda permissive `e2e_open` policy var, çünkü test istemcisi anon anahtarı service yerine kullanır (RLS `enabled` bayrağı iki tarafta da true → fingerprint'e dahil ve eşit).
2. **GRANT'lar** klonlanmaz (Supabase default privilege'ları yeterli).
3. **Event trigger** (`ensure_rls`): test DB'ye kurulmaz; RLS'i `e2e-schema.sql` açıkça açar. (`rls_auto_enable()` FONKSİYONU parity için mevcut.)
4. **`e2e_%` fonksiyonları** (fingerprint RPC) test DB'ye özgüdür, fingerprint kendilerini dışlar.
5. **Uzantılar**: vault/pg_stat_statements yapısal parity'ye dahil değil; `vector` App ile aynı şekilde `extensions` şemasındadır (public'te olursa `avg(vector)` aggregate'i fonksiyon parity'sini bozar — yaşandı, düzeltildi).

## KRİTİK: deparse nitelendirmesi

`pg_get_constraintdef / pg_get_indexdef / pg_get_triggerdef` çıktıları **çağıran oturumun search_path'ine göre** şema nitelendirmesi yapar. Bu yüzden fingerprint HER İKİ tarafta `search_path = extensions, pg_catalog` altında hesaplanmalıdır (RPC bunu `SET search_path` ile içinde sabitler; App tarafında referans üretirken başına `set search_path to extensions, pg_catalog;` eklenir).

## Yeniden senkronizasyon prosedürü (App şeması değiştiğinde)

App DB'ye erişim yalnız Supabase MCP üzerindendir; senkron ajan tarafından şu adımlarla yapılır:

1. **DDL çıkar** (App DB, `supabase-app` MCP `execute_sql`): `e2e-schema.sql` içindeki bölümler şu sorguların çıktısıdır —
   - Tablolar: pg_class/pg_attribute/pg_attrdef üzerinden `CREATE TABLE` üretimi (dosyadaki fingerprint fonksiyonunun `cols` CTE'siyle aynı kaynaklar).
   - Constraintler: `pg_get_constraintdef` ile `ALTER TABLE ... ADD CONSTRAINT` (önce p/u/c, sonra f).
   - Indexler: `pg_indexes.indexdef` (constraint destekleyenler hariç).
   - Fonksiyonlar: `pg_get_functiondef` (`\r` normalize edilir).
   - Triggerlar: `pg_get_triggerdef`.
2. **Test DB'yi resetle + uygula** (`claude_ai Supabase` MCP `apply_migration`, proje `luhvfbujwnlnpnoelzhg`): `e2e-schema.sql` içeriği parça parça (dosya reset DROP'larıyla başlar, idempotenttir).
3. **Referansı yenile**: fingerprint SELECT'ini App DB'de `set search_path to extensions, pg_catalog;` ile koştur, çıktıyı `expected-fingerprint.json`'a yaz.
4. **Doğrula**: `npm run test:e2e` — `schema-drift.spec.ts` yeşil olmalı.

## Güvenlik sınırları

- Bu dizindeki SQL **supabase/migrations/ altında DEĞİLDİR** ve App DB'ye asla uygulanmaz.
- Test DB ref'i prod ref'e eşitse `e2e/env.ts` fail-fast eder; bu koruma kaldırılamaz.
- Test DB'de keyfi-SQL çalıştıran yardımcı fonksiyon YOKTUR (bilinçli karar: RCE yüzeyi açmamak için `e2e_admin_exec` önerisi reddedildi); tek yardımcı `e2e_schema_fingerprint()` read-only'dir.
