import { ChevronDown, Sparkles } from 'lucide-react'

const DAILY_PRAYER = [
  "Allah'ım merhaba. Sen duasında ısrarcı olanın hayalini ona nasip edersin. Bu yüzden asla sana dua etmekten vazgeçmiyorum. Ya Hayyu, ya Kayyum, ya Zel Celali vel ikram. Ey yüceler yücesi olan isminin hakkı için senden istiyorum. Bana helal rızık ver Allah'ım. Eğer rızkım semada ise indir, yerde ise çıkar. Eğer uzakta ise yakınlaştır, yakında ise kolaylaştır. Az ise çoğalt, çok ise bereketlendir rızkımı.",
  "Allah'ım sen bize şah damarımızdan daha yakınsın. Dilim ile söyleyemediğim, dilimden geçiremediğim bütün dualarımı en iyi sen bilirsin. Beni zorlu bir imtihana koydun ve o imtihandan geçmemi nasip ettin. Hamdolsun. Ama içimde bir korku var ya Rabbi. Bu korkuyu kalbimden al ya Rabbi. Hayır sendendir, şer benim yaptıklarımdandır. Bana her daim gücümün, potansiyelimin farkına varmayı öğret, nasip et. Çünkü ben senin nurundan bir parçayım.",
  "Ey alemlerin ve arşın sahibi olan izzet ve ikram sahibi Allah'ım. Gönlüme zenginlik ver, karşıma hayırlı insanlar çıkar. Beni senin sevdiğin kullarınla rızıklandır. Bu dünya ve ahiret nimetlerinin en güzellerini ver. Bu dünyada da ahirette de yüzümü her daim güldür. Hayatımda, kaderimde beni bekleyen bir şer ve musibet varsa sen onları sessizce temizle. Beni içinden tereyağından kıl çeker gibi çek al. Beni kurtar, koru ya Rabbim. İleride de bir kavuşabileceğim nimet varsa sen onu daha da arttır ya Rabbi. Rızkıma, ömrüme, günüme, vaktime, hayatıma bereket ver. Beni ve sevdiklerimi hayal dahi edemediğim güzelliklere kavuştur yarabbi.",
  "Allah'ım bilinen bilinmeyen, görünen görünmeyen, akla gelen gelmeyen bütün kötülüklerden, kötü olabilecek her şerden, çareli çaresiz tüm hastalıklardan, dertlerden, kazadan, beladan, hain bakıştan, kem gözden, kötü sözlerden, her türlü sıkıntıdan, bedduadan ve kul hakkı almaktan sen beni, ailemi ve sevdiklerimi koru, muhafaza eyle.",
] as const

export function DailyPrayerCard() {
  return (
    <section
      data-testid="daily-prayer"
      aria-labelledby="daily-prayer-title"
      className="mb-5 overflow-hidden rounded-xl border border-[var(--accent)]/20 bg-[linear-gradient(135deg,var(--bg-card),var(--accent-muted))] shadow-[0_14px_40px_rgba(0,0,0,0.12)]"
    >
      <details className="group">
        <summary
          aria-label="Günlük duayı aç veya kapat"
          className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 outline-none transition-colors hover:bg-white/[0.025] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] [&::-webkit-details-marker]:hidden"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/15 text-[var(--accent)]">
            <Sparkles aria-hidden className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span
              id="daily-prayer-title"
              className="block text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--accent)]"
            >
              Günlük Dua
            </span>
            <span className="mt-0.5 block truncate text-[13px] text-[var(--text-secondary)]">
              Allah&apos;ım merhaba. Bugüne şükür, rızka ve berekete niyetle…
            </span>
          </span>
          <span className="hidden text-[11px] font-semibold text-[var(--text-muted)] sm:inline">
            <span className="group-open:hidden">Duayı aç</span>
            <span className="hidden group-open:inline">Duayı kapat</span>
          </span>
          <ChevronDown
            aria-hidden
            className="size-4 shrink-0 text-[var(--text-muted)] transition-transform duration-200 group-open:rotate-180"
          />
        </summary>

        <div
          data-testid="daily-prayer-text"
          className="space-y-4 border-t border-[var(--border-subtle)] px-4 pb-5 pt-4 sm:px-6"
        >
          {DAILY_PRAYER.map((paragraph) => (
            <p
              key={paragraph}
              className="max-w-4xl text-[14px] leading-7 text-[var(--text-secondary)]"
            >
              {paragraph}
            </p>
          ))}
        </div>
      </details>
    </section>
  )
}
