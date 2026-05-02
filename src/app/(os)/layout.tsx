import { AppLayout } from '@/components/layout/AppLayout'

export default function OsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AppLayout>
      {children}
    </AppLayout>
  )
}
