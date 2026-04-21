import { Lead } from './supabase'

export const CITY_CENTERS: Record<string, [number, number]> = {
  'İstanbul': [41.0082, 28.9784],
  'Ankara': [39.9334, 32.8597],
  'İzmir': [38.4237, 27.1428],
  'Antalya': [36.9081, 30.6934],
  'Bursa': [40.1885, 29.0610],
  'Adana': [37.0000, 35.3213],
  'Konya': [37.8746, 32.4932],
  'Gaziantep': [37.0662, 37.3825],
  'Mersin': [36.8121, 34.6415],
  'Trabzon': [41.0015, 39.7267],
  'Samsun': [41.2867, 36.3319],
  'Denizli': [37.7765, 29.0875],
  'Kayseri': [38.7312, 35.4826],
  'Eskişehir': [39.7767, 30.5206],
  'Diyarbakır': [37.9144, 40.2106],
}

export function getCoords(lead: Lead): [number, number] {
  if (lead.latitude && lead.longitude) {
    return [lead.latitude, lead.longitude]
  }

  const base = CITY_CENTERS[lead.city || ''] || [39.9334, 32.8597]
  const id = lead.google_place_id || lead.id || ''

  // FNV hash for deterministic offset
  let h1 = 2166136261
  let h2 = 2246822519
  for (let i = 0; i < id.length; i++) {
    const c = id.charCodeAt(i)
    h1 ^= c
    h1 = Math.imul(h1, 16777619)
    h2 ^= c * 31
    h2 = Math.imul(h2, 2246822519)
  }

  return [
    base[0] + ((Math.abs(h1) % 100000) / 100000 - 0.5) * 0.06,
    base[1] + ((Math.abs(h2) % 100000) / 100000 - 0.5) * 0.06,
  ]
}

export const STATUS_COLORS: Record<string, string> = {
  new: '#06b6d4',
  contacted: '#f59e0b',
  responded: '#8b5cf6',
  meeting: '#3b82f6',
  proposal: '#f97316',
  converted: '#10b981',
  lost: '#ef4444',
}

export const STATUS_LABELS: Record<string, string> = {
  new: 'YENİ',
  contacted: 'İLETİŞİM',
  responded: 'YANIT VERDİ',
  meeting: 'TOPLANTI',
  proposal: 'TEKLİF',
  converted: 'KAZANILDI',
  lost: 'KAYBEDILDI',
}
