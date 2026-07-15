// Eski dashboard deep-link'leri genel Ana Merkez'e taşınır.
import { redirect } from 'next/navigation'

export default function DashboardRedirect(): never {
  redirect('/command-center')
}
