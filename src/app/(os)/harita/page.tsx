import { HaritaClient } from '@/components/map/HaritaClient'

type HaritaPageProps = {
  searchParams: Promise<{ surface?: string | string[]; market?: string | string[] }>
}

export default async function HaritaPage({ searchParams }: HaritaPageProps) {
  const { surface, market } = await searchParams
  const initialSurface = surface === 'opportunities' ? 'opportunities' : 'accounts'
  const initialMarketScope = market === 'global' ? 'global' : 'tr'

  return <HaritaClient initialSurface={initialSurface} initialMarketScope={initialMarketScope} />
}
