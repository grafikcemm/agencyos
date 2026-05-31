/**
 * AgencyOS Clean Daily Start Reset Script
 * 
 * Prepares the system for a fresh automated production scan on June 1st, 2026.
 * Wipes leads, apollo enrichments, detaches projects, and resets last_daily_scan settings.
 * Usage: node scripts/clean-daily-start.js [--confirm]
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Parse environment variables from .env.local
const envPath = path.join(process.cwd(), '.env.local');
let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
let supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL\s*=\s*(.*)/);
  const keyMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY\s*=\s*(.*)/);
  if (urlMatch) supabaseUrl = urlMatch[1].trim();
  if (keyMatch) supabaseServiceKey = keyMatch[1].trim();
}

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Supabase URL or Service Role Key not found in environment or .env.local.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
});

async function main() {
  const confirmMode = process.argv.includes('--confirm');

  console.log('🔄 Preparing AgencyOS Clean Daily Reset for June 1, 2026...');
  
  // 1. Fetch data to backup
  const { data: leads, error: leadsErr } = await supabase.from('leads').select('*');
  if (leadsErr) {
    console.error('❌ Failed to fetch leads for backup:', leadsErr.message);
    process.exit(1);
  }

  const { data: enrichments, error: enrichErr } = await supabase.from('apollo_enrichments').select('*');
  if (enrichErr) {
    console.error('❌ Failed to fetch apollo enrichments for backup:', enrichErr.message);
    process.exit(1);
  }

  const leadsCount = leads ? leads.length : 0;
  const enrichCount = enrichments ? enrichments.length : 0;

  console.log(`📊 Found ${leadsCount} leads and ${enrichCount} Apollo enrichment records.`);

  // 2. Perform Backup
  const backupDir = path.join(process.cwd(), 'output', 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const backupPath = path.join(backupDir, 'leads-before-clean-start-2026-06-01.json');
  const backupData = {
    backup_timestamp: new Date().toISOString(),
    leads_count: leadsCount,
    apollo_enrichments_count: enrichCount,
    leads: leads || [],
    apollo_enrichments: enrichments || []
  };

  fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2), 'utf8');
  console.log(`✅ Backup successfully saved to: ${backupPath}`);

  if (!confirmMode) {
    console.log('\n⚠️  DRY RUN ONLY. To execute deletion, detach projects, and clear daily scan settings, run:');
    console.log('   npm run clean:daily-start -- --confirm\n');
    return;
  }

  console.log('\n💥 Resetting veritabanı to absolute production start...');

  // 3. Detach leads from projects (set lead_id to null)
  const { error: projectsErr } = await supabase
    .from('projects')
    .update({ lead_id: null })
    .not('lead_id', 'is', null);

  if (projectsErr) {
    console.error('❌ Failed to detach projects:', projectsErr.message);
    process.exit(1);
  }
  console.log('✅ Real projects successfully decoupled from test lead IDs.');

  // 4. Delete Apollo enrichments
  const { error: delEnrichErr } = await supabase
    .from('apollo_enrichments')
    .delete()
    .neq('lead_id', '00000000-0000-0000-0000-000000000000'); // delete all rows

  if (delEnrichErr) {
    console.error('❌ Failed to delete Apollo enrichments:', delEnrichErr.message);
    process.exit(1);
  }
  console.log(`✅ Deleted ${enrichCount} Apollo enrichment records.`);

  // 5. Delete Leads
  const { error: delLeadsErr } = await supabase
    .from('leads')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000'); // delete all rows

  if (delLeadsErr) {
    console.error('❌ Failed to delete leads:', delLeadsErr.message);
    process.exit(1);
  }
  console.log(`✅ Deleted ${leadsCount} lead records.`);

  // 6. Delete last_daily_scan setting
  const { error: delSettingErr } = await supabase
    .from('settings')
    .delete()
    .eq('key', 'last_daily_scan');

  if (delSettingErr) {
    console.error('❌ Failed to delete last_daily_scan setting:', delSettingErr.message);
    process.exit(1);
  }
  console.log('✅ Cleared last_daily_scan key from settings.');
  console.log('🎉 AgencyOS daily automated scan is ready to start clean on June 1, 2026!');
}

main().catch(err => {
  console.error('❌ Fatal script error:', err);
  process.exit(1);
});
