// Provider registry + tarama kaynakları konfigürasyonu.
//
// İki tür kaynak:
//  1. ATS şirket watchlist'i (uluslararası remote/tasarım/AI rolleri) — public ATS
//     API'leri, key gerektirmez. JOB_SOURCES operatör tarafından genişletilebilir;
//     hatalı slug scan.ts'te yakalanır ve atlanır.
//  2. TR keyword aramaları (Firecrawl) — öncelikli Türkiye/İstanbul pazarı.
import type { AtsSourceEntry } from '../types'
import { ATS_PROVIDERS } from './ats'
import { fetchTrJobs, kariyerTarget, linkedinGuestTarget, type TrTarget } from './firecrawl'

export { ATS_PROVIDERS, fetchTrJobs }
export type { TrTarget }

// İzlenen ATS şirketleri (GLOBAL pazar). Hepsi canlı doğrulandı — public ATS
// endpoint'leri yanıt veriyor ve aktif tasarım/brand/kreatif rolleri içeriyorlar.
// Operatör genişletebilir; ölü/yanlış slug scan.ts'te sessizce atlanır.
export const JOB_SOURCES: AtsSourceEntry[] = [
  { name: 'Figma', provider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/figma' },
  { name: 'Stripe', provider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/stripe' },
  { name: 'Airbnb', provider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/airbnb' },
  { name: 'Discord', provider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/discord' },
  { name: 'Vercel', provider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/vercel' },
  { name: 'Dropbox', provider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/dropbox' },
  { name: 'OpenAI', provider: 'ashby', careersUrl: 'https://jobs.ashbyhq.com/openai' },
  { name: 'Ramp', provider: 'ashby', careersUrl: 'https://jobs.ashbyhq.com/ramp' },
  { name: 'Vanta', provider: 'ashby', careersUrl: 'https://jobs.ashbyhq.com/vanta' },
  { name: 'Replit', provider: 'ashby', careersUrl: 'https://jobs.ashbyhq.com/replit' },
  { name: 'Linear', provider: 'ashby', careersUrl: 'https://jobs.ashbyhq.com/linear' },
  { name: 'Spotify', provider: 'lever', careersUrl: 'https://jobs.lever.co/spotify' },
]

// TR pazarı scrape hedefleri. Her hedef ÇOKLU tekil ilan detay linki içeren bir
// sayfayı işaret eder; firecrawl provider host-başına detay-URL pattern'i ile gerçek
// ilanları süzer (aggregator/arama başlığı değil). Operatörün profil rolleri × İstanbul.
//
//  • LinkedIn guest job-cards endpoint — anti-bot'suz HTML fragment; her kart
//    /jobs/view/<id>'e linkler. (Eski /jobs/search JS sayfası anti-bot'a takılıyordu.)
//  • kariyer.net arama sayfası — /is-ilani/<slug> detay anchor'ları.
export const TR_SCRAPE_TARGETS: TrTarget[] = [
  linkedinGuestTarget('grafik tasarımcı'),
  linkedinGuestTarget('sosyal medya tasarımcısı'),
  linkedinGuestTarget('art director'),
  linkedinGuestTarget('ui ux designer'),
  kariyerTarget('https://www.kariyer.net/is-ilanlari/grafik-tasarimci'),
  kariyerTarget('https://www.kariyer.net/is-ilanlari/sosyal-medya-tasarimcisi'),
  kariyerTarget('https://www.kariyer.net/is-ilanlari/ui-ux-tasarimci'),
]
