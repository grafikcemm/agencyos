// ─────────────────────────────────────────────────────────────────────────────
// V2 outreach feature flag'leri — brain/index.ts env-flag deseniyle aynı.
// Her yeni yetenek flag arkasında doğar, default KAPALI (06 §4 kapı 1).
// GMAIL_SEND_ENABLED=false iken sendGmailMessage dry-run moda düşer
// (gerçek Gmail API çağrısı YOK; akışın geri kalanı — HITL, suppression,
// idempotency, kayıt — aynen çalışır).
// ─────────────────────────────────────────────────────────────────────────────

export function isGmailSendEnabled(): boolean {
  return process.env.GMAIL_SEND_ENABLED === 'true'
}

export function isFollowupFsmEnabled(): boolean {
  return process.env.FOLLOWUP_FSM_ENABLED === 'true'
}

export interface V2FlagStatus {
  key: string
  enabled: boolean
  description: string
}

/** Konsol yüzeyi için okunur flag listesi (yalnız durum; secret değeri yok). */
export function describeV2Flags(env: Record<string, string | undefined> = process.env): V2FlagStatus[] {
  const on = (name: string) => env[name] === 'true'
  return [
    {
      key: 'GMAIL_SEND_ENABLED',
      enabled: on('GMAIL_SEND_ENABLED'),
      description: 'Gerçek Gmail gönderimi (kapalı = dry-run; taslak/onay akışı çalışır)',
    },
    {
      key: 'FOLLOWUP_FSM_ENABLED',
      enabled: on('FOLLOWUP_FSM_ENABLED'),
      description: 'Follow-up state machine (Sprint 2 — bu sprintte hep kapalı)',
    },
    {
      key: 'BRAIN_V2_ENABLED',
      enabled: on('BRAIN_V2_ENABLED'),
      description: 'Brain v2 orkestratör (shadow)',
    },
    {
      key: 'BRAIN_ACTIVE_ENABLED',
      enabled: on('BRAIN_ACTIVE_ENABLED'),
      description: 'Brain v2 active mode (write/gate yürütme)',
    },
  ]
}
