// Turkish-safe geo normalization — pure ASCII slugs.
// Handles: İ/ı, Ğ/ğ, Ş/ş, Ü/ü, Ö/ö, Ç/ç, mojibake (?stanbul → istanbul), encoding errors.

// Step 1: character-by-character lower with Turkish rules
const TR_MAP: Record<string, string> = {
  'İ': 'i', 'I': 'i',  // Turkish dotted-I / plain I both → i (for slug purposes)
  'Ğ': 'g', 'ğ': 'g',
  'Ş': 's', 'ş': 's',
  'Ü': 'u', 'ü': 'u',
  'Ö': 'o', 'ö': 'o',
  'Ç': 'c', 'ç': 'c',
  'ı': 'i',  // Turkish dotless-i → i
}

function toAsciiLower(s: string): string {
  return s
    .split('')
    .map(c => TR_MAP[c] ?? c.toLowerCase())
    .join('')
}

/** Pure ASCII slug: İstanbul→istanbul, Üsküdar→uskudar, Beşiktaş→besiktas */
export function slugify(s: string): string {
  if (!s) return ''
  return toAsciiLower(s)
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')  // strip anything non-ASCII after transliteration
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export { slugify as citySlugify }

// Known canonical city spellings
const CITY_CANONICAL: Record<string, string> = {
  'istanbul': 'İstanbul',
  'ankara': 'Ankara',
  'izmir': 'İzmir',
  'bursa': 'Bursa',
  'antalya': 'Antalya',
  'kocaeli': 'Kocaeli',
  'gaziantep': 'Gaziantep',
  'konya': 'Konya',
  'adana': 'Adana',
  'mersin': 'Mersin',
  'balikesir': 'Balıkesir',
  'manisa': 'Manisa',
  'sanliurfa': 'Şanlıurfa',
  'trabzon': 'Trabzon',
  'eskisehir': 'Eskişehir',
  // Çok-şehirli hedefleme (deep-research) ile eklenenler — taranan her şehir
  // burada olmalı, yoksa leads.city ham kalır ve getCityBonus/city_slug/öğrenme join'i kırılır.
  'mugla': 'Muğla',
  'denizli': 'Denizli',
  'kayseri': 'Kayseri',
  'sakarya': 'Sakarya',
  'tekirdag': 'Tekirdağ',
  'samsun': 'Samsun',
}

function canonicalCity(raw: string): string {
  const slug = slugify(raw)
  return CITY_CANONICAL[slug] ?? raw.trim()
}

// Normalize sector text — removes mojibake & common encoding errors
export function normalizeSector(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw
    .replace(/g[uü\?\uFFFD\u00A0]*zellik/gi, 'güzellik') // matches gzellik, gzellik, etc.
    .replace(/g\??zellik/gi, 'güzellik')
    .replace(/[\?\uFFFD\u00A0]stanbul/gi, 'İstanbul')
    .replace(/[\?\uFFFD\u00A0]sk[\?\uFFFD\u00A0]dar/gi, 'Üsküdar')
    .replace(/[\?\uFFFD\u00A0]/g, '')  // strip remaining replacement chars
    .trim()
}

export interface NormalizedLocation {
  city: string        // "İstanbul" canonical form
  district: string    // "Beşiktaş" or ""
  citySlug: string    // "istanbul"
  districtSlug: string // "besiktas" or ""
  googleQuery: string // "Beşiktaş İstanbul"
}

export function normalizeLocation(
  rawCity: string,
  rawDistrict?: string | null,
): NormalizedLocation {
  let cityStr = (rawCity ?? '').trim()
  let districtStr = (rawDistrict ?? '').trim()

  // Handle legacy patterns where city contains both city and district
  // e.g. "Istanbul Besiktas", "ıstanbul-esiktas", "ıstanbul-besiktas", "istanbul kadikoy", etc.
  const lowerCity = cityStr.toLowerCase()
  if (lowerCity.includes('istanbul') || lowerCity.includes('ıstanbul') || lowerCity.includes('istanyul')) {
    const separators = /[\s-]+/
    const parts = cityStr.split(separators)
    if (parts.length > 1) {
      cityStr = 'İstanbul'
      if (!districtStr) {
        districtStr = parts.slice(1).join(' ')
      }
    }
  }

  // Pre-normalize common typos/spelling variations
  const cleanDistrictLower = slugify(districtStr)
  if (cleanDistrictLower === 'besiktas' || cleanDistrictLower === 'esiktas') {
    districtStr = 'Beşiktaş'
  } else if (cleanDistrictLower === 'kadikoy') {
    districtStr = 'Kadıköy'
  } else if (cleanDistrictLower === 'uskudar') {
    districtStr = 'Üsküdar'
  } else if (cleanDistrictLower === 'sisli') {
    districtStr = 'Şişli'
  } else if (cleanDistrictLower === 'beyoglu') {
    districtStr = 'Beyoğlu'
  }

  const city = canonicalCity(cityStr)
  const district = districtStr.trim()
  const citySlug = slugify(city)
  const districtSlug = slugify(district)
  const googleQuery = district ? `${district} ${city}` : city

  return { city, district, citySlug, districtSlug, googleQuery }
}

export function matchesCity(
  leadCitySlug: string | null | undefined,
  filterCity: string,
): boolean {
  if (!leadCitySlug) return false
  const target = slugify(filterCity)
  // Also match if lead slug STARTS WITH target (handles "istanbul-besiktas" legacy)
  return leadCitySlug === target || leadCitySlug.startsWith(target + '-')
}
