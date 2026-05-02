import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Load .env.local
const envFile = fs.readFileSync('.env.local', 'utf8');
envFile.split('\n').forEach(line => {
  const [key, ...value] = line.split('=');
  if (key && value) {
    process.env[key.trim()] = value.join('=').trim();
  }
});

const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function testAnonAccess() {
  console.log('--- TESTING ANON ACCESS (BROWSER SIMULATION) ---');
  
  const tables = ['leads', 'projects', 'playbooks', 'ai_cost_logs', 'follow_ups', 'settings'];
  
  for (const table of tables) {
    const { data, count, error } = await supabaseAnon.from(table).select('*', { count: 'exact', head: true });
    if (error) {
      console.log(`❌ ${table}: Error - ${error.message}`);
    } else {
      console.log(`✅ ${table}: ${count} records visible to anon`);
    }
  }
}

testAnonAccess();
