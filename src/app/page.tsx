import { redirect } from 'next/navigation'

export default function HomePage() {
  redirect('/harita')
  
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg-base)]">
      <div className="text-center space-y-4">
        <div className="text-[var(--accent)] text-xs tracking-widest animate-pulse font-bold uppercase">Grafikcem Agency</div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-wide">KOMUTA MERKEZİ</h1>
        <p className="text-[var(--text-secondary)] text-sm">Yönlendiriliyor...</p>
      </div>
    </main>
  )
}
