import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Migration 066 SEMA SOZLESMESI.
//
// Bu dosya SQL'i çalıştırmaz — repo politikası gereği migration'lar SQL
// Editor'da elle uygulanır ve bu dosya "kanıt" tarafıdır. Sınanan şey, elle
// uygulanacak metnin güvenlik ve geri alınabilirlik kurallarını taşıdığı:
// yanlış yazılmış bir RLS satırı ancak canlıda fark edilirdi.

const ROOT = join(__dirname, '..', '..', '..')
const SQL = readFileSync(join(ROOT, 'migrations', '066_growth_experiments.sql'), 'utf8')
const ROLLBACK = readFileSync(join(ROOT, 'migrations', '066_growth_experiments_rollback.sql'), 'utf8')

const TABLOLAR = [
  'growth_experiments',
  'growth_experiment_variants',
  'prospect_import_batches',
  'outreach_provider_mappings',
  'outreach_provider_events',
]

describe('066 — tablo kümesi', () => {
  it('beş tablo da IF NOT EXISTS ile oluşturulur (idempotent)', () => {
    for (const t of TABLOLAR) {
      expect(SQL).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${t}\\b`))
    }
  })

  it('outreach_messages sütunları ADDITIVE ve NULLABLE', () => {
    for (const c of ['experiment_id', 'variant_id', 'source_batch_id', 'outreach_provider', 'provider_state']) {
      expect(SQL).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${c}\\b`))
    }
    // NOT NULL eklenirse mevcut satırlar geçersiz olurdu.
    const eklemeler = SQL.match(/ADD COLUMN IF NOT EXISTS [^;]+;/g) ?? []
    for (const e of eklemeler) expect(e).not.toMatch(/NOT NULL/)
  })

  it('mevcut CRM tablolarına DOKUNMAZ', () => {
    // leads / contacts / proposals / agent_tasks bu migration'ın konusu değil.
    for (const t of ['leads', 'contacts', 'proposals', 'agent_tasks']) {
      expect(SQL).not.toMatch(new RegExp(`(DROP|ALTER) TABLE public\\.${t}\\b`))
    }
  })
})

describe('066 — idempotensi ve bilinmeyen durum', () => {
  it('sağlayıcı olayları remote_event_id ile TEKİL', () => {
    expect(SQL).toMatch(/UNIQUE \(provider, remote_event_id\)/)
  })

  it('parti kaydı sağlayıcı koşusuyla TEKİL', () => {
    expect(SQL).toMatch(/UNIQUE \(provider, provider_run_id\)/)
  })

  it("'provider_unknown' kapalı kümenin PARÇASI", () => {
    // Zaman aşımı/5xx sonrası "gönderildi mi bilmiyoruz" durumu ADIYLA
    // saklanmalı; 'sent' ya da 'failed' saymak çift ya da kayıp gönderim demek.
    expect(SQL).toMatch(/'provider_unknown'/)
    expect(SQL).toMatch(/state\s+text NOT NULL DEFAULT 'pending'/)
  })

  it('tahmini ve GERÇEK maliyet AYRI sütun', () => {
    expect(SQL).toMatch(/estimated_cost_usd/)
    expect(SQL).toMatch(/actual_cost_usd/)
  })
})

describe('066 — gizlilik', () => {
  it('ham sağlayıcı payload SAKLANMAZ, yalnız hash', () => {
    expect(SQL).toMatch(/payload_hash/)
    expect(SQL).not.toMatch(/payload_json|raw_payload|raw_body/)
  })

  it('olay tablosunda e-posta/telefon sütunu YOK', () => {
    const olayBloku = SQL.slice(
      SQL.indexOf('CREATE TABLE IF NOT EXISTS public.outreach_provider_events'),
      SQL.indexOf('CREATE INDEX IF NOT EXISTS idx_provider_events_unprocessed'),
    )
    for (const alan of ['email', 'phone', 'address', 'body', 'subject']) {
      expect(olayBloku).not.toMatch(new RegExp(`\\b${alan}\\b`))
    }
  })
})

describe('066 — RLS ve erişim', () => {
  it('her tabloda RLS AÇIK', () => {
    for (const t of TABLOLAR) {
      expect(SQL).toMatch(new RegExp(`ALTER TABLE public\\.${t}\\s+ENABLE ROW LEVEL SECURITY`))
    }
  })

  it('anon/authenticated REVOKE — tarayıcıdan erişim yok', () => {
    for (const t of TABLOLAR) {
      expect(SQL).toMatch(new RegExp(`REVOKE ALL ON public\\.${t}\\s+FROM anon, authenticated`))
    }
  })

  it('hiçbir permissive policy TANIMLANMAZ', () => {
    // RLS açık + sıfır policy = tam red. Bir `CREATE POLICY ... USING (true)`
    // eklenirse bu test kırılır.
    expect(SQL).not.toMatch(/CREATE POLICY/i)
  })

  it('şema yeniden yüklenir (PostgREST görsün)', () => {
    expect(SQL).toMatch(/NOTIFY pgrst, 'reload schema'/)
  })

  it('tek transaction içinde uygulanır', () => {
    expect(SQL).toMatch(/^BEGIN;/m)
    expect(SQL).toMatch(/^COMMIT;/m)
  })
})

describe('066 — rollback ikizi', () => {
  it('her tabloyu ve her sütunu geri alır', () => {
    for (const t of TABLOLAR) {
      expect(ROLLBACK).toMatch(new RegExp(`DROP TABLE IF EXISTS public\\.${t}\\b`))
    }
    for (const c of ['experiment_id', 'variant_id', 'source_batch_id', 'outreach_provider', 'provider_state']) {
      expect(ROLLBACK).toMatch(new RegExp(`DROP COLUMN IF EXISTS ${c}\\b`))
    }
  })

  it('VERİ KAYBI ve ön koşullar AÇIKÇA yazılı', () => {
    expect(ROLLBACK).toMatch(/VERI KAYBI/)
    expect(ROLLBACK).toMatch(/APIFY_ENABLED/)
    expect(ROLLBACK).toMatch(/işlenmemiş satır YOK/)
  })

  it('sütunlar tablolardan ÖNCE düşürülür (FK sırası)', () => {
    const iSutun = ROLLBACK.indexOf('DROP COLUMN IF EXISTS experiment_id')
    const iTablo = ROLLBACK.indexOf('DROP TABLE IF EXISTS public.growth_experiments')
    expect(iSutun).toBeGreaterThan(-1)
    expect(iTablo).toBeGreaterThan(iSutun)
  })
})

describe('066 — uygulanmadı', () => {
  it('otomatik uygulama YOLU YOK', () => {
    // Repo politikası: migration dosyası kanıttır, uygulama manuel. Bir
    // npm script ya da CI adımı bunu otomatikleştirirse burada yakalanır.
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
    const scripts = Object.values(pkg.scripts ?? {}).join(' ')
    expect(scripts).not.toMatch(/db push|migration up|migrate deploy|psql .*066/)
  })
})
