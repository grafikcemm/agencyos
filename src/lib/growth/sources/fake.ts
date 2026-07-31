// ─────────────────────────────────────────────────────────────────────────────
// FAKE kaynak sağlayıcı — para harcamayan, ağa çıkmayan, DETERMİNİSTİK kaynak.
//
// Bu bir "test mock'u" değil, birinci sınıf bir sağlayıcıdır: pilotun tüm
// akışı (parti → normalize → dizi → gönderim) Apify hiç açılmadan uçtan uca
// koşturulabilsin diye var. Gerçek sağlayıcı açılmadan önce akışın doğru
// çalıştığını kanıtlamanın tek yolu budur.
//
// Fixture'lar bilinçli olarak KİRLİ: kişisel adres, rol adresi, kopya kayıt,
// eksik şirket, bozuk URL ve zararlı değer içerir. Temiz bir fixture yalnız
// mutlu yolu kanıtlar.
// ─────────────────────────────────────────────────────────────────────────────

import { normalizeLeads } from '../normalize'
import type {
  CostEstimate,
  ProviderHealth,
  RawRecord,
  RunHandle,
  RunStatus,
  SourceProvider,
  SourceQuery,
} from './types'

/** Sağlayıcıdan gelebilecek gerçekçi çöp de dahil sabit veri kümesi. */
export const FAKE_DATASET: RawRecord[] = [
  {
    name: 'Deniz Aktaş',
    title: 'Kurucu',
    company: 'Aktaş Mimarlık',
    website: 'https://aktasmimarlik.com.tr',
    email: 'deniz@aktasmimarlik.com.tr',
    city: 'İstanbul',
    country: 'TR',
    phone: '+90 555 000 00 00',
    apifyInternalScore: 0.91,
  },
  {
    full_name: 'Selin Yücel',
    job_title: 'Pazarlama Müdürü',
    company_name: 'Yücel Diş Kliniği',
    domain: 'yuceldis.com',
    email: 'info@yuceldis.com',
    linkedin_url: 'https://www.linkedin.com/in/selinyucel',
    city: 'Ankara',
  },
  {
    // Kişisel adres → CRM'e girer, otomatik diziye GİRMEZ.
    name: 'Murat Şen',
    company: 'Şen Reklam',
    email: 'muratsen1987@gmail.com',
    city: 'İzmir',
  },
  {
    // Aynı kişi ikinci kez, farklı alan adlarıyla → duplicate.
    fullName: 'Deniz Aktaş',
    companyName: 'Aktas Mimarlik',
    emailAddress: 'DENIZ@AktasMimarlik.com.tr',
  },
  {
    // Şirket bilgisi yok, yalnız LinkedIn → kabul edilir, missingCompany sayılır.
    name: 'Elif Kara',
    linkedin: 'https://linkedin.com/in/elifkara',
  },
  {
    // Başlık enjeksiyonu denemesi → e-posta reddedilir, kimlik kalmaz.
    name: 'Kötü Kayıt',
    email: 'x@y.com\r\nBcc: kurban@example.com',
  },
]

const now = () => new Date().toISOString()

export function createFakeProvider(dataset: RawRecord[] = FAKE_DATASET): SourceProvider {
  let lastQuery: SourceQuery | null = null

  return {
    key: 'fake',

    health(): ProviderHealth {
      return { key: 'fake', enabled: true, configured: true, costed: false, reason: null }
    },

    async estimate(query: SourceQuery): Promise<CostEstimate> {
      return {
        provider: 'fake',
        estimatedCostUsd: 0,
        basis: 'fake sağlayıcı — ağ çağrısı ve maliyet yok',
        requestedCount: query.limit,
      }
    },

    async start(query: SourceQuery): Promise<RunHandle> {
      lastQuery = query
      // Deterministik koşu kimliği: aynı sorgu aynı kimliği üretir; testler
      // rastgeleliğe bağlanmaz ve idempotensi yolu gerçekten sınanabilir.
      const providerRunId = `fake-${query.niche}-${query.location}-${query.limit}`
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
      return { provider: 'fake', providerRunId, startedAt: now() }
    },

    async status(providerRunId: string): Promise<RunStatus> {
      return { provider: 'fake', providerRunId, state: 'succeeded', actualCostUsd: 0 }
    },

    async fetch(): Promise<RawRecord[]> {
      const limit = lastQuery?.limit ?? dataset.length
      return dataset.slice(0, limit)
    },

    normalize: normalizeLeads,
  }
}
