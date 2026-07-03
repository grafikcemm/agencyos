// Brain v2 — GATE: izin sınıflandırma + approval bütünlüğü ilkeleri (§13).
// Faz 1 shadow'da yalnız SINIFLANDIRIR (yürütmez). Digest/redaction yardımcıları
// Faz 3 approval sistemi tarafından da kullanılır (compile-time paylaşım).

import { createHash } from 'node:crypto'
import type { PlanStep, GateDecision, PermissionClass, RiskLevel, DataSensitivity } from './types'

const RISK_ORDER: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2, critical: 3 }
const SENS_ORDER: Record<DataSensitivity, number> = { public: 0, internal: 1, confidential: 2, secret: 3 }

// scope precedence: spend > external > write > read.
export function classifyScopes(scopes: string[]): PermissionClass {
  if (scopes.some((s) => s.endsWith(':spend'))) return 'spend'
  if (scopes.some((s) => s.endsWith(':send') || s.endsWith(':external'))) return 'external'
  if (scopes.some((s) => /:(write|update|delete|create)$/.test(s))) return 'write'
  return 'read'
}

// Auto yalnız: read + risk≤low + sensitivity≤internal (§13). Aksi → approval.
export function gateDecision(step: PlanStep): GateDecision {
  const cls = step.permissionClass
  const auto =
    cls === 'read' &&
    RISK_ORDER[step.riskLevel] <= RISK_ORDER.low &&
    SENS_ORDER[step.dataSensitivity] <= SENS_ORDER.internal
  const reason = auto
    ? 'güvenli okuma → otomatik'
    : `onay gerekli (${cls}, risk=${step.riskLevel}, veri=${step.dataSensitivity})`
  return { stepId: step.id, permissionClass: cls, auto, reason }
}

// Kararlı anahtar sıralamalı JSON — aynı eylem daima aynı digest (§13 bütünlük).
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const keys = Object.keys(value as Record<string, unknown>).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(',')}}`
}

// ONAYLANAN tam eylemin özeti — yürütme anında yeniden hesaplanıp eşleşme aranır.
export function computeActionDigest(action: string, args: unknown): string {
  return createHash('sha256').update(stableStringify({ action, args })).digest('hex')
}

// Operatöre gösterilebilir güvenli önizleme — sır/token/email maskeler, kısaltır.
export function redactPreview(text: string, maxLen = 500): string {
  const masked = (text ?? '')
    .replace(/sk-[A-Za-z0-9_-]{6,}/g, '‹gizli-anahtar›')
    .replace(/Bearer\s+[A-Za-z0-9._-]{8,}/gi, 'Bearer ‹gizli›')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '‹email›')
  return masked.length > maxLen ? `${masked.slice(0, maxLen)}…` : masked
}
