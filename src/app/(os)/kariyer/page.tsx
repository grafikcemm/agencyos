import CareerMovedNotice from '@/components/career/CareerMovedNotice'

// Kariyer Radarı AgencyOS kapsamı DEĞİL (2026-08-10 kullanıcı kararı).
// Veri okumadan taşındı ekranı döner. Devir: docs/CAREER-HANDOFF-2026-08-10.md
export default function KariyerPage() {
  return (
    <CareerMovedNotice
      title="Kariyer Radarı"
      what="Dış iş ilanı taraması, başvuru takibi ve ilan taslakları"
    />
  )
}
