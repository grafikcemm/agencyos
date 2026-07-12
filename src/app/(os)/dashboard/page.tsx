// /dashboard → /bugun kalıcı yönlendirme (Faz C6, finding #10).
// Eski "Komuta Merkezi" içeriği /command-center'da yaşıyor; günlük operasyonun
// tek girişi /bugun. Eski deep-link'ler kırılmaz — redirect ile taşınır.
import { redirect } from 'next/navigation'

export default function DashboardRedirect(): never {
  redirect('/bugun')
}
