import React from "react";

type CardVariant = "default" | "white" | "red";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
  /** Editöryel renk-blok panelleri: ters beyaz veya dolu kırmızı vurgu */
  variant?: CardVariant;
}

const variantClasses: Record<CardVariant, string> = {
  default:
    "bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)]",
  // "white" artık parchment vurgu paneli (Apple beyaz⇄parchment ritmi)
  white: "bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)]",
  red: "bg-[var(--accent)] border border-[var(--accent)] text-white",
};

export function Card({
  children,
  className = "",
  noPadding = false,
  variant = "default",
}: CardProps) {
  return (
    <div
      className={`rounded-card ${variantClasses[variant]} ${noPadding ? "p-0" : "p-4"} ${className}`}
    >
      {children}
    </div>
  );
}
