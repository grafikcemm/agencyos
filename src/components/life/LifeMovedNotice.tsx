import Link from 'next/link'
import { ArrowRight, Info } from 'lucide-react'

// TASINDI EKRANI — 404 DEGIL.
//
// Eski URL'ler calisiyor durumda kaliyor. 404 dondurmek, kaydedilmis bir
// yer imini "sayfa yok" diye gostermek olurdu; oysa sayfa yok degil, BASKA
// YERDE. Ekran salt okunur: buradan yazma yapilamaz, cunku sahiplik artik
// GrafikcemOS'ta ve iki yerden yazmak iki dogruluk kaynagi demektir.

export default function LifeMovedNotice({
  title,
  hint,
}: {
  title: string
  /** Hangi Hayat Merkezi sekmesine bakilacagi — kullaniciyi aramada birakma. */
  hint?: string
}) {
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-6">
        <div className="mb-3 flex items-center gap-2 text-neutral-400">
          <Info className="h-4 w-4" aria-hidden />
          <span className="text-xs uppercase tracking-wide">Taşındı</span>
        </div>
        <h1 className="mb-2 text-lg font-medium text-neutral-100">{title}</h1>
        <p className="text-sm leading-relaxed text-neutral-400">
          Bu alan <strong className="text-neutral-200">GrafikcemOS Hayat Merkezi</strong>&apos;ne taşındı.
          {hint ? ` ${hint}` : ''}
        </p>
        <p className="mt-3 text-sm leading-relaxed text-neutral-500">
          Veriler yerinde: görevler ve alışkanlıklar aynı veritabanında tutuluyor,
          Telegram asistanı da onları okumaya devam ediyor. Değişen tek şey,
          düzenlemenin hangi panelden yapıldığı.
        </p>
        <Link
          href="/command-center"
          className="mt-6 inline-flex items-center gap-1.5 text-sm text-neutral-300 hover:text-neutral-100"
        >
          Ana Merkez&apos;e dön <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </div>
  )
}
