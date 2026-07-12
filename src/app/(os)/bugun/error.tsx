'use client'

// /bugun sayfa-seviyesi hata durumu (panel-içi hatalar panelde gösterilir;
// bu yalnız render/veri katmanının tümden çökmesi içindir).
export default function BugunError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="max-w-6xl mx-auto px-5 py-12 text-center" data-testid="bugun-error">
      <h1 className="text-lg font-bold text-[var(--text-primary)] mb-2">Kokpit yüklenemedi</h1>
      <p className="text-[13px] text-[var(--text-muted)] mb-4">{error.message}</p>
      <button
        type="button"
        onClick={reset}
        className="text-[13px] font-semibold px-4 py-2 rounded-lg bg-[var(--accent)] text-white hover:brightness-110"
      >
        Tekrar dene
      </button>
    </div>
  )
}
