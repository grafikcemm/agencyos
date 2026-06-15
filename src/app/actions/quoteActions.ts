'use server';

import { createServerSupabase } from '@/lib/supabaseServer';
import { FALLBACK_QUOTES } from '@/data/quotes';

interface SelectedQuote {
  quote: string;
  author?: string | null;
  id?: string | number | null;
}

export async function ensureTodayQuote(): Promise<void> {
  try {
    const supabase = createServerSupabase();
    const today = new Date().toISOString().slice(0, 10);

    // 1. Check if we already have a quote for today
    const { data: existing } = await supabase
      .from('daily_quotes')
      .select('id')
      .eq('date', today)
      .maybeSingle();

    if (existing) return;

    // 2. Fetch candidates from the pool
    const { data: poolQuotes } = await supabase
      .from('quote_pool')
      .select('id, quote, author')
      .or(`used_on.is.null,used_on.neq.${today}`)
      .order('used_on', { ascending: true, nullsFirst: true })
      .limit(50);

    let selected: SelectedQuote | null = null;

    if (!poolQuotes || poolQuotes.length === 0) {
      // Havuz boş/erişilemez: statik yedek listeden seç (typed static import).
      if (FALLBACK_QUOTES.length > 0) {
        const localQuote = FALLBACK_QUOTES[Math.floor(Math.random() * FALLBACK_QUOTES.length)];
        selected = {
          quote: localQuote.aphorism,
          author: localQuote.theme || 'Henry OS',
          id: null,
        };
      }
    } else {
      selected = poolQuotes[Math.floor(Math.random() * poolQuotes.length)];
    }

    if (!selected) return;

    // 4. Upsert into daily_quotes
    const { error: upsertError } = await supabase
      .from('daily_quotes')
      .upsert(
        { date: today, quote: selected.quote, author: selected.author ?? null },
        { onConflict: 'date' }
      );

    if (upsertError) return; // Silent return

    // 5. Mark as used in pool (only if fetched from DB)
    if (selected.id !== null) {
      await supabase
        .from('quote_pool')
        .update({ used_on: today })
        .eq('id', selected.id);
    }
  } catch {
    // Veritabanı, ağ veya ortam hatalarında sessiz kurtarma — günlük söz akışı
    // kritik değil; hata UI'ı bloklamamalı.
  }
}
