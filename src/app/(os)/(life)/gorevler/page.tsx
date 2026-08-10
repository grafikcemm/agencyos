import LifeMovedNotice from '@/components/life/LifeMovedNotice'

// Kişisel görev paneli kesin olarak GrafikcemOS Agent Takımı'na devredildi.
// Eski deep-link 404 olmaz; AgencyOS burada LIFE DB verisi okumaz veya yazmaz.
export default function GorevlerPage() {
  return <LifeMovedNotice title="Aktif Görevler" hint="Hayat Merkezi → Aktif Görevler sekmesi." />
}
