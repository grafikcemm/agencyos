import type { ActiveTask } from "@/types/tasks";

const CREATED_AT = "2026-05-30T00:00:00.000Z";

export const DEFAULT_ACTIVE_TASKS: ActiveTask[] = [
  {
    id: "seed-grafikcem-brand-roadmap",
    title: "Grafikcem Creative Studio branding planı: yol haritası PDF + reels çekimlerini hafta hafta planla",
    is_done: false,
    category: "active",
    sort_order: 10,
    is_priority: true,
    created_at: CREATED_AT,
  },
  {
    id: "seed-carousel-to-reels-distribution",
    title: "Instagram carousel sistemini Reels'e çevir; LinkedIn, TikTok ve X dağıtım planını AI ile çıkar",
    is_done: false,
    category: "active",
    sort_order: 20,
    is_priority: true,
    created_at: CREATED_AT,
  },
  {
    id: "seed-claude-n8n-course",
    title: "Claude Code ve n8n videolarını bitir, tek sayfa aksiyon notu çıkar",
    is_done: false,
    category: "active",
    sort_order: 30,
    is_priority: false,
    created_at: CREATED_AT,
  },
  {
    id: "seed-beykent-vize",
    title: "Beykent vizelerini tamamla",
    is_done: false,
    category: "active",
    sort_order: 40,
    is_priority: false,
    created_at: CREATED_AT,
  },
  {
    id: "seed-ai-ad-visual-course",
    title: "Yapay zeka ile reklam görselleri kursunu bitir",
    is_done: false,
    category: "waiting",
    sort_order: 110,
    is_priority: false,
    created_at: CREATED_AT,
  },
  {
    id: "seed-youtube-automation-saas",
    title: "YouTube otomasyonu için SaaS fikrini doğrula",
    is_done: false,
    category: "waiting",
    sort_order: 120,
    is_priority: false,
    created_at: CREATED_AT,
  },
  {
    id: "seed-mobile-app-ideas",
    title: "Mobil uygulama fikirlerini 3 adaydan 1 seçime indir",
    is_done: false,
    category: "waiting",
    sort_order: 130,
    is_priority: false,
    created_at: CREATED_AT,
  },
  {
    id: "seed-behance-agency-mail",
    title: "Behance portfolyosunu güncelle ve ajanslara mail planı çıkar",
    is_done: false,
    category: "waiting",
    sort_order: 140,
    is_priority: false,
    created_at: CREATED_AT,
  },
  {
    id: "seed-english-daily-system",
    title: "İngilizceyi günlük çapaya bağla: İngilizce360 dersi + kelime defteri",
    is_done: false,
    category: "waiting",
    sort_order: 150,
    is_priority: false,
    created_at: CREATED_AT,
  },
];

export function getDefaultActiveTasks(): ActiveTask[] {
  return DEFAULT_ACTIVE_TASKS.map((task) => ({ ...task }));
}
