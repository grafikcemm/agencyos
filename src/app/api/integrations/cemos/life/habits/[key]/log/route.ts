import { HabitLog, handleWrite, lifeSupabaseAdmin } from '@/lib/integrations/cemosLifeWrite'
import { BadRequestError } from '@/lib/api/guards'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params
  return handleWrite(req, 'life/habits/:key/log', 'POST', HabitLog, async (input) => {
    const habitKey = decodeURIComponent(key ?? '').trim()
    if (!habitKey || habitKey.length > 100) throw new BadRequestError('Geçersiz alışkanlık anahtarı.')

    // Bilinmeyen anahtara log YAZILMAZ: `habit_logs` tablosunda FK yok, yani
    // yazim basarili olur ve panelde hicbir yerde gorunmeyen olu bir satir kalir.
    const { data: habit, error: hErr } = await lifeSupabaseAdmin
      .from('habits').select('key').eq('key', habitKey).maybeSingle()
    if (hErr) throw new Error(hErr.message)
    if (!habit) throw new Error(`Alışkanlık bulunamadı: ${habitKey}`)

    // `unique (habit_key, date)` -> upsert. Ayni gun icin ikinci kayit degil,
    // GUNCELLEME: "geri al" da bu yoldan (value: 0) gecer.
    const { error } = await lifeSupabaseAdmin
      .from('habit_logs')
      .upsert({ habit_key: habitKey, date: input.date, value: input.value }, { onConflict: 'habit_key,date' })
    if (error) throw new Error(error.message)
    return { summary: { logged: true, habitKey, date: input.date, value: input.value } }
  })
}
