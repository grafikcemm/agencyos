import LifeMovedNotice from '@/components/life/LifeMovedNotice'

// Alışkanlık paneli kesin olarak GrafikcemOS Agent Takımı'na devredildi.
// Eski deep-link 404 olmaz; AgencyOS burada LIFE DB verisi okumaz veya yazmaz.
export default function AliskanliklarPage() {
  return <LifeMovedNotice title="Alışkanlıklar" hint="Hayat Merkezi → Alışkanlıklar sekmesi." />
}
