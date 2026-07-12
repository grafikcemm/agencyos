// /bugun loading durumu — panel iskeletleri (layout kayması yok).
export default function BugunLoading() {
  return (
    <div className="max-w-6xl mx-auto px-5 py-8" data-testid="bugun-loading">
      <div className="h-7 w-32 rounded bg-[var(--bg-card)] animate-pulse mb-6" />
      <div className="h-20 rounded-xl bg-[var(--bg-card)] animate-pulse mb-5" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-40 rounded-xl bg-[var(--bg-card)] animate-pulse" />
        ))}
      </div>
    </div>
  )
}
