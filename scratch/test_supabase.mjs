import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Load .env.local
const envFile = fs.readFileSync('.env.local', 'utf8');
envFile.split('\n').forEach(line => {
  const [key, ...value] = line.split('=');
  if (key && value) {
    process.env[key.trim()] = value.join('=').trim();
  }
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testConnection() {
  console.log('--- TEST 1: SUPABASE BAĞLANTISI ---');

  // 1. Leads
  const { data: leads, error: leadsErr } = await supabase.from('leads').select('*').limit(3);
  if (leadsErr) console.log('❌ leads: Hata - ' + leadsErr.message);
  else console.log(`✅ leads: ${leads.length} kayıt geldi (${leads.map(l => l.business_name).join(', ')})`);

  // 2. Projects
  const { data: projects, error: projErr } = await supabase.from('projects').select('*').eq('status', 'active');
  if (projErr) console.log('❌ projects: Hata - ' + projErr.message);
  else console.log(`✅ projects: ${projects.length} aktif proje`);

  // 3. AI Cost Logs (this month)
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0,0,0,0);
  const { data: logs, error: logsErr } = await supabase.from('ai_cost_logs').select('*').gte('created_at', startOfMonth.toISOString());
  if (logsErr) console.log('❌ ai_cost_logs: Hata - ' + logsErr.message);
  else console.log(`✅ ai_cost_logs: ${logs.length} kayıt geldi`);

  // 4. Follow Ups (today)
  const today = new Date().toISOString().split('T')[0];
  const { data: followUps, error: fuErr } = await supabase.from('follow_ups').select('*').gte('created_at', today);
  if (fuErr) console.log('❌ follow_ups: Hata - ' + fuErr.message);
  else console.log(`✅ follow_ups: ${followUps.length} bugün kaydı`);

  // 5. Settings
  const { data: settings, error: setErr } = await supabase.from('settings').select('*').limit(1);
  if (setErr) console.log('❌ settings: Hata - ' + setErr.message);
  else console.log(`✅ settings: ${settings.length > 0 ? 'Veri geldi' : 'Boş döndü'}`);
}

testConnection();
