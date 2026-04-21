import { redirect } from 'next/navigation'

export default function HomePage() {
  redirect('/dashboard')
  
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050810]">
      <div className="text-center space-y-4">
        <div className="text-[var(--os-accent)] text-xs tracking-widest animate-pulse">[AGENCY OS // V0.1]</div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-wide">KOMUTA MERKEZİ</h1>
        <p className="text-[var(--text-secondary)] text-sm font-mono">Yönlendiriliyor...</p>
      </div>
    </main>
  )
}
