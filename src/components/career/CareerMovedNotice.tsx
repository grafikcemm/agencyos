import Link from 'next/link'
import { ArrowRight, Compass } from 'lucide-react'

// KARİYER YÜZEYİ AgencyOS'TAN ÇIKTI (2026-08-10, kullanıcı kararı).
//
// AgencyOS yalnız ajansın gelir ve müşteri edinim işletim sistemidir. İş/kariyer
// arama ve kişisel gelişim rotası GrafikcemOS Kariyer Ajanı'nın sahipliğindedir.
//
// Bu ekran 404 DEĞİL ve VERİ OKUMAZ. Eski yer imleri çalışır durumda kalır,
// kullanıcı nereye bakacağını görür, fakat AgencyOS içinde çalışan bir kariyer
// ekranı KALMAZ — iki panelden yazmak iki doğruluk kaynağı demektir.
//
// Devir envanteri ve veri sözleşmesi: docs/CAREER-HANDOFF-2026-08-10.md

export default function CareerMovedNotice({
  title,
  what,
}: {
  title: string
  /** Bu yüzeyin GrafikcemOS tarafında hangi işi devraldığı. */
  what: string
}) {
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6">
        <div className="mb-3 flex items-center gap-2 text-[var(--text-tertiary)]">
          <Compass className="h-4 w-4" aria-hidden />
          <span className="text-xs uppercase tracking-wide">Geçiş hazırlanıyor</span>
        </div>
        <h1 className="mb-2 text-lg font-medium text-[var(--text-primary)]">{title}</h1>
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
          {what} artık <strong className="text-[var(--text-primary)]">GrafikcemOS Kariyer Ajanı</strong>&apos;na ait.
          AgencyOS yalnız ajansın gelir ve müşteri edinim motorudur.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-[var(--text-tertiary)]">
          Veri silinmedi: ilan, tarama, yol haritası ve kanıt kayıtları yerinde duruyor ve
          devir manifestiyle birlikte GrafikcemOS&apos;a aktarılacak. Bu ekran veri okumaz.
        </p>
        <Link
          href="/command-center"
          className="mt-6 inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          Ana Merkez&apos;e dön <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </div>
  )
}
