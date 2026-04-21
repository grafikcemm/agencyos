import { Sidebar } from '@/components/os/Sidebar'
import { TopBar } from '@/components/os/TopBar'

export default function OsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-[var(--bg-base)]">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <TopBar />
        <main className="flex-1 overflow-auto relative">
          {children}
        </main>
      </div>
    </div>
  )
}
