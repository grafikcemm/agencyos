import { PageHeader } from '@/components/ui/PageHeader'
import { DocumentCenter } from '@/components/documents/DocumentCenter'
import { PENDING_PRICING_DECISIONS, canSendProposal } from '@/data/pricingVersions'

export const metadata = { title: 'Belge Merkezi' }

// BELGE MERKEZİ — müşteri yaşam döngüsüne bağlı, versiyonlu belge kaydı.
// Sunucu bileşeni: veri statik kayıttan gelir, DB turu yoktur.
export default function BelgelerPage() {
  const trGate = canSendProposal('tr')
  const globalGate = canSendProposal('global')

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="MÜŞTERİ"
        title="Belge Merkezi"
        description="Türkiye ve Global paketler ayrı hukuk metinleridir; çeviri değildirler. Her belge taslak doğar ve uzman incelemesinden geçmeden imzaya çıkamaz."
        meta="Taslak · avukat/mali müşavir incelemesi gerekli"
      />

      {/* TEK BİRİNCİL KARAR: onaylı fiyat sürümü yoksa teklif üretilemez. */}
      <section
        className="mt-6 rounded-xl border border-[var(--warning)]/30 bg-[var(--warning)]/5 p-4"
        aria-labelledby="fiyat-karar"
      >
        <h2 id="fiyat-karar" className="text-sm font-semibold text-[var(--text-primary)]">
          Teklif üretimi karar bekliyor
        </h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Türkiye: {trGate.reason} · Global: {globalGate.reason}
        </p>
        <ul className="mt-3 grid gap-1 text-sm text-[var(--text-tertiary)] sm:grid-cols-2">
          {PENDING_PRICING_DECISIONS.map((d) => (
            <li key={d} className="flex gap-2">
              <span aria-hidden>·</span>
              <span>{d}</span>
            </li>
          ))}
        </ul>
      </section>

      <DocumentCenter />
    </div>
  )
}
