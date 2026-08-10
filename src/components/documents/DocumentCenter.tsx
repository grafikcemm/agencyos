"use client"

import { useMemo, useState } from 'react'
import { FileText, ChevronDown } from 'lucide-react'
import {
  DOCUMENT_DISCLAIMER,
  REVIEW_LABEL,
  STAGE_LABEL,
  STATUS_LABEL,
  documentsFor,
  type DocumentSpec,
  type DocumentStage,
  type Jurisdiction,
} from '@/data/documentCenter'

// Belge listesi 40+ kayıt. HEPSİNİ AYNI ANDA duvar hâlinde göstermek karar
// yüzeyi değil, envanterdir. Bu yüzden: önce yargı alanı seçimi, sonra yaşam
// döngüsü aşamasına göre gruplama, ayrıntı ise talep üzerine açılır.

const STAGE_ORDER: DocumentStage[] = [
  'teklif', 'sozlesme', 'onboarding', 'teslimat', 'tahsilat', 'offboarding', 'buyume', 'uyum',
]

export function DocumentCenter() {
  const [jurisdiction, setJurisdiction] = useState<Jurisdiction>('TR')
  const [openStage, setOpenStage] = useState<DocumentStage | null>('sozlesme')

  const grouped = useMemo(() => {
    const docs = documentsFor(jurisdiction)
    const map = new Map<DocumentStage, DocumentSpec[]>()
    for (const stage of STAGE_ORDER) {
      const list = docs.filter((d) => d.stage === stage)
      if (list.length > 0) map.set(stage, list)
    }
    return map
  }, [jurisdiction])

  const total = useMemo(() => documentsFor(jurisdiction).length, [jurisdiction])

  return (
    <section className="mt-8" aria-labelledby="belge-merkezi">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="belge-merkezi" className="text-sm font-semibold text-[var(--text-primary)]">
          {jurisdiction === 'TR' ? 'Türkiye paketi' : 'Global paket'}{' '}
          <span className="font-normal text-[var(--text-tertiary)]">· {total} belge</span>
        </h2>
        <div className="flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] p-0.5" role="tablist">
          {(['TR', 'GLOBAL'] as const).map((j) => (
            <button
              key={j}
              role="tab"
              aria-selected={jurisdiction === j}
              onClick={() => setJurisdiction(j)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                jurisdiction === j
                  ? 'bg-[var(--accent-muted)] text-[var(--text-primary)]'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {j === 'TR' ? 'Türkiye' : 'Global / English'}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-2 text-xs text-[var(--text-tertiary)]">{DOCUMENT_DISCLAIMER}</p>

      <div className="mt-4 flex flex-col gap-2">
        {[...grouped.entries()].map(([stage, docs]) => {
          const isOpen = openStage === stage
          return (
            <div key={stage} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)]">
              <button
                onClick={() => setOpenStage(isOpen ? null : stage)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                  <FileText className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
                  {STAGE_LABEL[stage]}
                </span>
                <span className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
                  {docs.length} belge
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    aria-hidden
                  />
                </span>
              </button>

              {isOpen ? (
                <ul className="border-t border-[var(--border-subtle)]">
                  {docs.map((doc) => (
                    <li key={doc.id} className="border-b border-[var(--border-subtle)] px-4 py-3 last:border-b-0">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-sm text-[var(--text-primary)]">{doc.title}</span>
                        <span className="text-[11px] text-[var(--text-tertiary)]">{STATUS_LABEL[doc.status]}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--text-tertiary)]">
                        <span>{REVIEW_LABEL[doc.requiresReview]}</span>
                        {doc.signatureRequired ? <span>İmza gerekli</span> : null}
                        <span>Gereken girdi: {doc.requiredInputs.length}</span>
                      </div>
                      {doc.note ? (
                        <p className="mt-1 text-[11px] text-[var(--warning)]">{doc.note}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}
