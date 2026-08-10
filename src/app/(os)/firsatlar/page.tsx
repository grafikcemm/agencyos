import { permanentRedirect } from 'next/navigation'

export default function FirsatlarPage() {
  // Eski adres bağlantı uyumluluğu için kalır; ayrı bir ürün yüzeyi değildir.
  permanentRedirect('/harita?surface=opportunities')
}
