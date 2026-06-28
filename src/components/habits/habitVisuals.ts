import {
  Music,
  Salad,
  Droplet,
  Snowflake,
  Pill,
  Dumbbell,
  Languages,
  Phone,
  Megaphone,
  Smile,
  Sparkles,
  Flame,
  type LucideIcon,
} from 'lucide-react'
import type { HabitGroup } from '@/lib/habits/config'

const ICONS: Record<string, LucideIcon> = {
  music: Music,
  salad: Salad,
  droplet: Droplet,
  snowflake: Snowflake,
  pill: Pill,
  dumbbell: Dumbbell,
  languages: Languages,
  phone: Phone,
  megaphone: Megaphone,
  smile: Smile,
  sparkles: Sparkles,
}

export function iconFor(key: string | null): LucideIcon {
  return (key && ICONS[key]) || Flame
}

/** Grup başına ikon çipi rengi — hiyerarşi için kasıtlı renk kodlaması. */
export const GROUP_VISUAL: Record<HabitGroup, { fg: string; bg: string }> = {
  is: { fg: '#60a5fa', bg: 'rgba(96,165,250,0.14)' }, // mavi — iş
  saglik: { fg: '#34d399', bg: 'rgba(52,211,153,0.14)' }, // yeşil — sağlık
  rutinler: { fg: '#a78bfa', bg: 'rgba(167,139,250,0.14)' }, // mor — rutinler
}
