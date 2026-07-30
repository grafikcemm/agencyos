import { AppLayout } from '@/components/layout/AppLayout'
import QueryProvider from '@/components/providers/QueryProvider'
import { showsLifeUi } from '@/lib/lifeFlags'

export default function OsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // LIFE_UI_OWNER SUNUCUDA okunur (RT-A2). Bayrağı istemciye taşımak, kişisel
  // menü girişlerinin bir an görünüp sonra kaybolmasına (hydration flash) ve
  // env adının tarayıcı bundle'ına girmesine yol açardı.
  return (
    <QueryProvider>
      <AppLayout showsLifeUi={showsLifeUi()}>
        {children}
      </AppLayout>
    </QueryProvider>
  )
}
