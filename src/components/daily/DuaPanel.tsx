'use client'
import React, { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

interface DuaPanelProps {
  quote?: string;
  author?: string;
}

export function DuaPanel({ quote, author }: DuaPanelProps) {
  const [isOpen, setIsOpen] = useState(false)

  const defaultQuote = "Hayat, fırtınanın dinmesini beklemek değil; yağmurda dans etmeyi öğrenmektir.";
  const defaultAuthor = "SENECA";

  const duaMetni = `"Rahman ve Rahim olan Allah'ım,
Günün telaşı ve yorgunluğu biterken, her şeyin asıl sahibi olan Sana sığınıyorum. Verdiklerin için hamdolsun, aldıkların için sabır diliyorum. Bu gece kapına; yorgun bir beden, huzur arayan bir ruh ve bitmeyen bir umutla geldim.

Ya Rabbi; Geçmişin yüklerini, yarının kaygılarını ve kalbimi yoran tüm dertleri Senin sonsuz merhametine emanet ediyorum. Sen ki imkansızı mümkün kılansın; gönlümde saklı tuttuğum, kimselere diyemediğim ama senin en iyi bildiğin dertlerime ferahlık ver.

Rabbim; Kalbime sükûnet, zihnime berraklık, haneme huzur nasip eyle. Geleceğimi rızana uygun eyle, ayaklarımı doğru yolun üzere sabit kıl. Nefsimin şerrinden, dünyanın bitmek bilmeyen hırslarından beni koru.

Ya Şâfî; Ruhumdaki ve bedenimdeki tüm yaralara şifa ver. Yarın uyandığımda, Senin rızanla dolu bir güne huzurla, şükürle ve umutla uyanmayı nasip eyle. Sevdiklerimi koru, onları her türlü kaza ve beladan muhafaza buyur.

Ey her şeyi işiten ve dua edenlerin duasını karşılıksız bırakmayan Allah'ım; Beni affet, beni yolunda daim eyle. Amin."`

  return (
    <div className="w-full">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between px-4 py-4 bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-soft hover:bg-[var(--bg-card-hover)] transition-all group ${
          isOpen ? 'rounded-t-[14px] border-b-0' : 'rounded-card'
        }`}
      >
        <div className="flex items-center gap-3">
          <span className="text-xl text-[var(--accent)]">🤲</span>
          <div className="text-left">
            <p className="text-sm font-semibold text-[var(--text-primary)] font-display">
              Gün Sonu Duası
            </p>
            <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)] mt-0.5">
              Günü bitirmeden önce oku
            </p>
          </div>
        </div>
        {isOpen ? (
          <ChevronUp className="w-5 h-5 text-[var(--text-muted)]" />
        ) : (
          <ChevronDown className="w-5 h-5 text-[var(--text-muted)]" />
        )}
      </button>

      {isOpen && (
        <div className="bg-[var(--bg-surface)] border-x border-b border-[var(--border-subtle)] rounded-b-[14px] shadow-soft animate-in fade-in duration-300 overflow-hidden">
          <div className="px-4 py-6 font-sans">

            {/* GÜNLÜK SÖZ */}
            <div className="mb-6">
              <p className="text-[var(--text-muted)] text-sm italic">
                &quot;{quote || defaultQuote}&quot;
              </p>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-px w-6 bg-[var(--border-subtle)]" />
                <span className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--text-muted)]">
                  {author || defaultAuthor}
                </span>
              </div>
            </div>

            <div className="h-px w-full bg-[var(--border-subtle)] mb-6" />

            <p className="text-[var(--text-muted)] text-sm leading-relaxed whitespace-pre-line opacity-90">
              {duaMetni}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
