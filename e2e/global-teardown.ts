import { E2E_TELEGRAM_CHAT_ID } from '../playwright.config'
import { cleanupE2E, E2E_EMAIL_DOMAIN, E2E_MARK, supabaseAdmin } from './helpers'

async function countRows(
  label: string,
  query: PromiseLike<unknown>,
): Promise<number> {
  const result = (await query) as { data?: unknown[] | null; error?: { message: string } | null }
  if (result.error) throw new Error(`[e2e teardown] ${label} okunamadı: ${result.error.message}`)
  return result.data?.length ?? 0
}

/** Suite sonunda cleanup yalnız denenmez, kanıtlanır. Test DB'de bir marker bile
 * kalırsa komut EXIT=1 olur; "E2E yeşil ama artık bıraktı" durumu kapanır. */
export default async function globalTeardown(): Promise<void> {
  await cleanupE2E()
  const db = supabaseAdmin()

  const checks = await Promise.all([
    countRows('leads', db.from('leads').select('id').ilike('business_name', `%${E2E_MARK}%`)),
    countRows('suppression', db.from('suppression_list').select('id').ilike('address', `%${E2E_EMAIL_DOMAIN}%`)),
    countRows('enrichment setting', db.from('settings').select('key').eq('key', 'enrichment_last_run')),
    countRows('telegram claims', db.from('telegram_update_claims').select('update_id').gte('update_id', 910_000_000)),
    countRows('telegram deliveries', db.from('telegram_outbound_deliveries').select('id').gte('update_id', 910_000_000)),
    countRows('telegram pending', db.from('telegram_pending_actions').select('chat_key').eq('chat_key', E2E_TELEGRAM_CHAT_ID)),
    countRows('telegram tasks', db.from('active_tasks').select('id').ilike('title', '%e2e-tg%')),
    countRows('telegram logs', db.from('telegram_conversations').select('id').ilike('message', '%e2e-tg%')),
  ])

  const residue = checks.reduce((sum, n) => sum + n, 0)
  if (residue > 0) {
    throw new Error(`[e2e teardown] test DB artığı kaldı: toplam=${residue}, dağılım=${checks.join(',')}`)
  }
  console.log('[e2e] cleanup doğrulandı: test DB artığı sıfır')
}
