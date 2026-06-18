import * as React from "react"

import { cn } from "@/lib/utils"

type SpotlightColor = "violet" | "magenta" | "orange" | "coral"

interface GradientSpotlightCardProps {
  /** Atmosfer rengi — sayfa içinde rotasyon kullanın (Framer imzası). */
  color?: SpotlightColor
  className?: string
  children: React.ReactNode
}

/**
 * Framer imza cihazı: oversized atmosfer tile'ı. Siyah grid içine renk
 * doygunluğuyla "elevation" katar (ağır gölge yerine). Stil globals.css
 * `.gradient-spotlight*` utility'lerinden gelir; içerik z-10'da kalır.
 *
 * Seyrek kullanın — bir viewport satırında 3+ doygun kart moodboard'a döner.
 */
export function GradientSpotlightCard({
  color = "violet",
  className,
  children,
}: GradientSpotlightCardProps) {
  return (
    <div
      className={cn(
        "gradient-spotlight",
        `gradient-spotlight-${color}`,
        "p-6",
        className,
      )}
    >
      <div className="relative z-10">{children}</div>
    </div>
  )
}
