import React from "react";

interface EditorialPageHeaderProps {
  /** Üst mono mikro-etiket (örn. "KOMUTA MERKEZİ") */
  eyebrow?: string;
  /** Büyük Helvetica display başlık */
  title: React.ReactNode;
  /** İsteğe bağlı açıklama satırı */
  description?: React.ReactNode;
  /** Sağ taraf aksiyon yuvası (butonlar, filtreler) */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Swift Glow editöryel sayfa başlığı: mono eyebrow + dev display başlık +
 * hairline alt çizgi. Tüm sayfa relayout'ları bunu paylaşır.
 */
export function EditorialPageHeader({
  eyebrow,
  title,
  description,
  actions,
  className = "",
}: EditorialPageHeaderProps) {
  return (
    <header
      className={`flex flex-col gap-3 pb-6 mb-8 border-b border-[var(--border-subtle)] ${className}`}
    >
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-2 min-w-0">
          {eyebrow ? <span className="label-eyebrow">{eyebrow}</span> : null}
          <h1 className="display-title text-[var(--text-primary)]">{title}</h1>
        </div>
        {actions ? (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        ) : null}
      </div>
      {description ? (
        <p className="text-sm text-[var(--text-secondary)] max-w-2xl leading-relaxed">
          {description}
        </p>
      ) : null}
    </header>
  );
}
