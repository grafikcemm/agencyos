"use client"

import type { CareerResourceLink, CareerResourceKind } from "@/data/careerRoadmap"
import { safeExternalUrl } from "@/utils/safeUrl"

const KIND_META: Record<CareerResourceKind, { glyph: string; label: string }> = {
  course: { glyph: "▦", label: "kurs" },
  youtube: { glyph: "▶", label: "youtube" },
  channel: { glyph: "◉", label: "kanal" },
  doc: { glyph: "¶", label: "döküman" },
  book: { glyph: "▤", label: "kitap" },
  tool: { glyph: "⚙", label: "araç" },
}

/**
 * Tek bir isimli kaynağı tıklanır satır olarak render eder.
 * Güvenli http/https URL → yeni sekmede açılan <a> (noopener noreferrer).
 * Güvensiz/eksik URL → tıklanamaz düz metin (link riski yok).
 */
export function ResourceLink({ link }: { link: CareerResourceLink }) {
  const href = safeExternalUrl(link.url)
  const meta = link.kind ? KIND_META[link.kind] : undefined

  const inner = (
    <>
      <span
        className="font-mono text-[var(--text-tertiary)] shrink-0 mt-0.5 w-3 text-center"
        aria-hidden="true"
      >
        {meta?.glyph ?? "›"}
      </span>
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-1.5 flex-wrap">
          <span
            className={`text-xs font-sans truncate ${
              href
                ? "text-[var(--info)] group-hover/res:underline"
                : "text-[var(--text-secondary)]"
            }`}
          >
            {link.title}
          </span>
          {meta && (
            <span className="text-[9px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider shrink-0">
              {meta.label}
            </span>
          )}
          {link.free !== undefined && (
            <span
              className={`text-[9px] font-mono px-1 py-0.5 rounded border shrink-0 ${
                link.free
                  ? "text-[var(--success)] border-[var(--success)]/30 bg-[var(--success)]/5"
                  : "text-[var(--text-muted)] border-[var(--border-subtle)]"
              }`}
            >
              {link.free ? "ücretsiz" : "ücretli"}
            </span>
          )}
        </span>
        {link.note && (
          <span className="block text-[10px] text-[var(--text-muted)] font-sans mt-0.5">
            {link.note}
          </span>
        )}
      </span>
    </>
  )

  if (!href) {
    return <div className="flex items-start gap-2 py-1">{inner}</div>
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group/res flex items-start gap-2 py-1 rounded transition-colors hover:bg-[var(--bg-elevated)] -mx-1 px-1"
    >
      {inner}
    </a>
  )
}
