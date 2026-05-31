#!/usr/bin/env node
/**
 * Manual trigger for opportunity scan.
 * Usage:
 *   npm run opportunity:scan              -> live scan (saves to DB)
 *   npm run opportunity:scan -- --dryRun  -> preview only
 */

require('dotenv').config({ path: '.env.local' })

const args = process.argv.slice(2)
const dryRun = args.includes('--dryRun') || args.includes('--dry-run')
const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const cronSecret = process.env.CRON_SECRET

async function main() {
  if (!cronSecret) {
    console.error('[opportunity-scan] Missing CRON_SECRET in .env.local')
    process.exit(1)
  }

  const url = `${baseUrl}/api/cron/opportunity-scan${dryRun ? '?dryRun=true' : ''}`
  console.log(`[opportunity-scan] ${dryRun ? 'DRY-RUN' : 'LIVE'} mode`)
  console.log(`[opportunity-scan] Calling: ${url}`)

  try {
    const res = await fetch(url, {
      headers: {
        'x-cron-secret': cronSecret
      }
    })
    const data = await res.json()
    console.log('\n--- Result ---')
    console.log(JSON.stringify(data, null, 2))

    if (data.success) {
      console.log(`\n[OK] ${data.total_signals} signals collected`)
      if (typeof data.inserted_count === 'number') {
        console.log(`[OK] ${data.inserted_count} new signals inserted`)
      }
      if (data.actionable_count > 0) {
        console.log(`[ACTION] ${data.actionable_count} actionable signals`)
      }
      if (data.parked_count > 0) {
        console.log(`[PARKED] ${data.parked_count} parked signals`)
      }
    } else {
      console.error(`\n[ERROR] Scan failed: ${data.error}`)
      process.exit(1)
    }
  } catch (err) {
    console.error(`\n[ERROR] Network error: ${err}`)
    console.error('Make sure the dev server is running: npm run dev')
    process.exit(1)
  }
}

main()
