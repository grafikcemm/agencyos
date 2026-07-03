// Lead Intelligence v2 mod bayrağı.
// KURAL: settings YÖNETİR (deploysuz off/shadow/active geçişi), env YALNIZ kill-switch.
// LEAD_INTELLIGENCE_V2_KILL truthy → her zaman 'off'; env hiçbir şeyi AÇAMAZ.

import { supabaseAdmin } from '../supabase'

export type LeadIntelMode = 'off' | 'shadow' | 'active'

const VALID_MODES: ReadonlySet<string> = new Set(['off', 'shadow', 'active'])

export function isKillSwitchOn(env: Record<string, string | undefined> = process.env): boolean {
  const v = (env.LEAD_INTELLIGENCE_V2_KILL ?? '').toLowerCase().trim()
  return v === '1' || v === 'true' || v === 'on' || v === 'yes'
}

// Saf çözümleme — testlenebilir. settingsValue: settings.lead_intelligence_v2 satır değeri.
export function resolveMode(killSwitch: boolean, settingsValue: unknown): LeadIntelMode {
  if (killSwitch) return 'off'
  if (settingsValue && typeof settingsValue === 'object') {
    const mode = (settingsValue as { mode?: unknown }).mode
    if (typeof mode === 'string' && VALID_MODES.has(mode)) return mode as LeadIntelMode
  }
  if (typeof settingsValue === 'string' && VALID_MODES.has(settingsValue)) {
    return settingsValue as LeadIntelMode
  }
  return 'off'
}

export async function getLeadIntelMode(): Promise<LeadIntelMode> {
  const kill = isKillSwitchOn()
  if (kill) return 'off'
  try {
    const { data } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('key', 'lead_intelligence_v2')
      .maybeSingle()
    return resolveMode(false, data?.value)
  } catch {
    return 'off'
  }
}
