import CareerMovedNotice from '@/components/career/CareerMovedNotice'

// Kariyer gelişim rotası AgencyOS kapsamı DEĞİL (2026-08-10 kullanıcı kararı).
// Veri okumadan taşındı ekranı döner. Devir: docs/CAREER-HANDOFF-2026-08-10.md
export default function GelisimPage() {
  return (
    <CareerMovedNotice
      title="Gelişim"
      what="Kişisel gelişim rotası, yetkinlik haritası ve kanıt takibi"
    />
  )
}
