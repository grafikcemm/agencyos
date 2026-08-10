import React from "react";
import { PageHeader } from './PageHeader'

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
    <PageHeader
      eyebrow={eyebrow ?? '// AgencyOS'}
      title={title}
      description={description}
      actions={actions}
      className={`mb-8 ${className}`}
    />
  );
}
