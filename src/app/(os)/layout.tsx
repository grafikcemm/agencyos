import { AppLayout } from '@/components/layout/AppLayout'
import QueryProvider from '@/components/providers/QueryProvider'

export default function OsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <QueryProvider>
      <AppLayout>
        {children}
      </AppLayout>
    </QueryProvider>
  )
}
