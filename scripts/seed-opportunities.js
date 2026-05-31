#!/usr/bin/env node
/**
 * Seed Opportunities — Insert 7 core products, watch topics, and trend sources into DB.
 * Usage: npm run opportunity:seed
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

const PRODUCTS = [
  {
    id: 'opp-payment-stack',
    title: 'Grafikcem Web Sitesi Satis Altyapisi',
    category: 'side_income',
    action_tier: 'launch_now',
    priority_order: 1,
    status: 'planning_started',
    description: 'Mevcut Grafikcem web sitesini ilk dijital urun satisi icin checkout, teslimat ve basit satis sayfasi akisina hazirlayan icraat paketi.',
    target_audience: 'Grafikcem kitlesinden ilk dijital urunu satin alacak tasarimcilar, icerik ureticileri ve freelancerlar.',
    price_range: 'Altyapi maliyeti dusuk; ilk urun fiyati $4.99',
    score_total: 86,
    is_active: true
  },
  {
    id: 'opp-prompt-booklet',
    title: 'Grafikcem Prompt Kitapcigi',
    category: 'digital_product',
    action_tier: 'launch_now',
    priority_order: 2,
    status: 'ready_to_finish',
    description: 'Tasarimcilar ve icerik ureticileri icin dogrudan kopyalanabilir, ornek ciktili, kisa ve uygulanabilir AI prompt kitapcigi.',
    target_audience: 'Grafik tasarimcilar, sosyal medya tasarimcilari, icerik ureticileri, junior kreatifler.',
    price_range: '$4.99',
    score_total: 90,
    is_active: true
  },
  {
    id: 'opp-designer-agent-pack',
    title: 'Tasarimcilar Icin AI Agent Paketi',
    category: 'digital_product',
    action_tier: 'next_bet',
    priority_order: 3,
    status: 'planning_started',
    description: 'Tasarimcilarin tekrar eden islerinde kullanacagi hazir GPT/Gem/Gemini talimatlari, brief asistanlari ve uretim agent sistemleri.',
    target_audience: 'Freelancer tasarimcilar, sosyal medya tasarimcilari, junior kreatifler, kucuk ajans ekipleri.',
    price_range: '$19 - $49',
    score_total: 85,
    is_active: true
  },
  {
    id: 'opp-mini-ai-creative-ops',
    title: 'Mini AI Creative Operations Egitimi',
    category: 'workshop',
    action_tier: 'next_bet',
    priority_order: 4,
    status: 'idea_stage',
    description: 'Tasarimcilarin AI ile brief alma, fikir uretme, gorsel uretme, revize yonetme ve teslimat akisini hizlandiracagi mini egitim.',
    target_audience: 'Tasarimcilar, icerik ureticileri, sosyal medya ekipleri.',
    price_range: '$29 - $79',
    score_total: 76,
    is_active: true
  },
  {
    id: 'opp-agencyos-lite',
    title: 'AgencyOS Lite - Freelancer CRM Template',
    category: 'saas',
    action_tier: 'incubate',
    priority_order: 5,
    status: 'idea_stage',
    description: 'Freelancerlar icin lead, teklif, proje, odeme, revize ve haftalik aksiyon yonetimini tek yerde toplayan sade AgencyOS template.',
    target_audience: 'Freelancer tasarimcilar, kucuk ajans sahipleri.',
    price_range: '$29 - $99',
    score_total: 73,
    is_active: true
  },
  {
    id: 'opp-feed-the-goat',
    title: 'Feed the Goat Kisiye Ozel Sistem',
    category: 'side_income',
    action_tier: 'incubate',
    priority_order: 6,
    status: 'idea_stage',
    description: 'Kisisel hedef, disiplin, spor, kariyer ve uretkenlik alanlari icin kisiye ozel kurulabilen sistem/plan paketi.',
    target_audience: 'Disiplin kurmak isteyen genc profesyoneller, ogrenciler.',
    price_range: '$49 - $199',
    score_total: 57,
    is_active: true
  },
  {
    id: 'opp-ai-vault',
    title: 'Grafikcem AI Vault Membership',
    category: 'subscription',
    action_tier: 'park',
    priority_order: 7,
    status: 'idea_stage',
    description: 'Aylik promptlar, agent sistemleri, mini egitimler ve kreatif workflow kaynaklarinin toplandigi ileriki seviye uyelik alani.',
    target_audience: 'Grafikcem urunlerini zaten satin almis tasarimcilar/freelancerlar.',
    price_range: '$9 - $19/ay',
    score_total: 55,
    is_active: true
  }
]

const WATCH_TOPICS = [
  { topic: 'AI prompt marketplace', keywords: ['prompt marketplace', 'prompt store', 'prompt selling', 'prompt template marketplace'], linked_product_id: 'opp-prompt-booklet' },
  { topic: 'AI design tools', keywords: ['ai design', 'design agent', 'creative ai', 'ai for designers', 'midjourney workflow'], linked_product_id: 'opp-designer-agent-pack' },
  { topic: 'Freelancer CRM', keywords: ['freelancer crm', 'freelance tool', 'client management', 'project tracking freelancer'], linked_product_id: 'opp-agencyos-lite' },
  { topic: 'Creator economy tools', keywords: ['creator economy', 'digital product sales', 'gumroad alternative', 'sell digital products'], linked_product_id: 'opp-payment-stack' },
  { topic: 'AI training and courses', keywords: ['ai course', 'ai workshop', 'prompt engineering course', 'ai workflow training'], linked_product_id: 'opp-mini-ai-creative-ops' },
  { topic: 'Membership platforms', keywords: ['membership platform', 'subscription box', 'premium content', 'patreon alternative'], linked_product_id: 'opp-ai-vault' },
  { topic: 'Turkey digital opportunity', keywords: ['turkey startup', 'turkish market', 'turkiye dijital', 'kobiler dijital'], linked_product_id: null },
  { topic: 'No-code AI tools', keywords: ['no-code ai', 'ai without coding', 'ai automation', 'zapier ai'], linked_product_id: null },
  { topic: 'Micro-SaaS', keywords: ['micro saas', 'indie saas', 'solo founder', 'bootstrapped saas', 'one person startup'], linked_product_id: null },
  { topic: 'Habit and productivity', keywords: ['habit tracker', 'productivity system', 'discipline app', 'goal setting tool'], linked_product_id: 'opp-feed-the-goat' }
]

const SOURCES = [
  { id: 'product_hunt', name: 'Product Hunt', type: 'rss', url: 'https://www.producthunt.com/feed', is_active: true, trust_score: 70, notes: 'Seeded' },
  { id: 'hacker_news', name: 'Hacker News', type: 'api', url: 'https://news.ycombinator.com', is_active: true, trust_score: 70, notes: 'Seeded' },
  { id: 'reddit', name: 'Reddit', type: 'json_feed', url: 'https://reddit.com', is_active: true, trust_score: 70, notes: 'Seeded' },
  { id: 'google_trends', name: 'Google Trends', type: 'api', url: 'https://trends.google.com', is_active: true, trust_score: 80, notes: 'Seeded' },
  { id: 'turkey_gap', name: 'Türkiye Fırsat Açığı', type: 'static', url: '', is_active: true, trust_score: 100, notes: 'Seeded' }
]

async function main() {
  console.log('--- Opportunity Intelligence Seed ---')

  // Upsert products
  console.log(`\nInserting ${PRODUCTS.length} products...`)
  for (const product of PRODUCTS) {
    const { error } = await supabase.from('opportunity_products').upsert(product, { onConflict: 'id' })
    if (error) {
      console.error(`  [ERROR] ${product.id}: ${error.message}`)
    } else {
      console.log(`  [OK] ${product.title}`)
    }
  }

  // Insert watch topics (skip if already exists by checking topic name)
  console.log(`\nInserting ${WATCH_TOPICS.length} watch topics...`)
  for (const topic of WATCH_TOPICS) {
    const { data: existing } = await supabase
      .from('opportunity_watch_topics')
      .select('id')
      .eq('topic', topic.topic)
      .limit(1)

    if (existing && existing.length > 0) {
      console.log(`  [SKIP] "${topic.topic}" already exists`)
      continue
    }

    const { error } = await supabase.from('opportunity_watch_topics').insert(topic)
    if (error) {
      console.error(`  [ERROR] "${topic.topic}": ${error.message}`)
    } else {
      console.log(`  [OK] "${topic.topic}"`)
    }
  }

  // Upsert trend sources
  console.log(`\nInserting ${SOURCES.length} sources...`)
  for (const source of SOURCES) {
    const { error } = await supabase.from('opportunity_trend_sources').upsert(source, { onConflict: 'id' })
    if (error) {
      console.error(`  [ERROR] ${source.id}: ${error.message}`)
    } else {
      console.log(`  [OK] ${source.name}`)
    }
  }

  // Verify counts correctly
  const { count: productsCount } = await supabase.from('opportunity_products').select('*', { count: 'exact', head: true })
  const { count: topicsCount } = await supabase.from('opportunity_watch_topics').select('*', { count: 'exact', head: true })
  const { count: sourcesCount } = await supabase.from('opportunity_trend_sources').select('*', { count: 'exact', head: true })

  console.log(`\n--- Seed Complete ---`)
  console.log(`Products in DB: ${productsCount !== null ? productsCount : '?'}`)
  console.log(`Watch topics in DB: ${topicsCount !== null ? topicsCount : '?'}`)
  console.log(`Trend sources in DB: ${sourcesCount !== null ? sourcesCount : '?'}`)
}

main().catch(err => {
  console.error('Seed failed:', err)
  process.exit(1)
})
