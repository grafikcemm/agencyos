import 'server-only'
import { supabaseAdmin } from '@/lib/supabase'
import { readKnowledgeFile } from '@/lib/knowledge'

// One row of the `agents` registry (migration 009). model + system_prompt are
// editable from the DB so the operator can re-tune or upgrade a model without a
// code change.
export interface AgentRow {
  key: string
  name: string
  role: string
  description: string | null
  model: string
  system_prompt: string
  tools: string[]
  status: AgentStatus
  sort_order: number
  is_active: boolean
}

export type AgentStatus = 'idle' | 'waiting' | 'working' | 'error'

const AGENT_COLUMNS =
  'key, name, role, description, model, system_prompt, tools, status, sort_order, is_active'

// All active agents, CEO first (sort_order ASC).
export async function getAgents(): Promise<AgentRow[]> {
  const { data, error } = await supabaseAdmin
    .from('agents')
    .select(AGENT_COLUMNS)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error) throw new Error(`Ajan registry okunamadı: ${error.message}`)
  return (data ?? []) as AgentRow[]
}

// Single agent by key, or null when missing/inactive.
export async function getAgent(key: string): Promise<AgentRow | null> {
  const { data, error } = await supabaseAdmin
    .from('agents')
    .select(AGENT_COLUMNS)
    .eq('key', key)
    .maybeSingle()

  if (error) throw new Error(`Ajan "${key}" okunamadı: ${error.message}`)
  return (data as AgentRow | null) ?? null
}

// Update an agent's live status (idle/waiting/working/error). Best-effort —
// telemetry, never blocks task execution.
export async function setAgentStatus(key: string, status: AgentStatus): Promise<void> {
  try {
    await supabaseAdmin
      .from('agents')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('key', key)
  } catch (error) {
    console.error(`setAgentStatus(${key}, ${status}) başarısız:`, error)
  }
}

// Compose the full system prompt for an agent: the editable DB prompt plus the
// shared knowledge files (and the sales framework for the Sales Rep). Missing
// knowledge files read as '' so this never throws on an incomplete vault.
export function buildAgentSystemPrompt(agent: AgentRow, extraContext = ''): string {
  const profile = readKnowledgeFile('00_GRAFIKCEM_CONTEXT.md')
  const pricing = readKnowledgeFile('PRICING_RULES.md')
  const business = readKnowledgeFile('BUSINESS_MODEL.md')
  const salesFramework = agent.key === 'sales_rep' ? readKnowledgeFile('SALES_FRAMEWORK.md') : ''

  const sections: string[] = [
    `Sen ${agent.name}'sin — Grafikcem agentic growth engine'inin "${agent.role}" katmanı.`,
    agent.description ? `Görevin: ${agent.description}` : '',
    'Türkçe konuş. Çıktıların net, eyleme dönük ve kısa olsun.',
    'Hiçbir şeyi otomatik gönderme — mail, teklif veya DM için her zaman operatör onayı iste.',
    agent.system_prompt ? `\n--- ROL TALİMATI ---\n${agent.system_prompt}` : '',
    profile ? `\n--- KİŞİSEL BAĞLAM ---\n${profile}` : '',
    pricing ? `\n--- FİYATLANDIRMA KURALLARI ---\n${pricing}` : '',
    business ? `\n--- İŞ MODELİ ---\n${business}` : '',
    salesFramework ? `\n--- SATIŞ ÇERÇEVESİ ---\n${salesFramework}` : '',
    extraContext ? `\n--- GÜNCEL VERİ ---\n${extraContext}` : '',
  ]

  return sections.filter(Boolean).join('\n')
}
