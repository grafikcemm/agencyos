/**
 * AgencyOS Manual Daily Scan Trigger Script
 * 
 * Invokes the Vercel-ready cron endpoint locally or in production.
 * Usage: npm run daily:scan [-- --dryRun]
 */

const fs = require('fs');
const path = require('path');

// Parse environment variables from .env.local
const envPath = path.join(process.cwd(), '.env.local');
let cronSecret = process.env.CRON_SECRET;

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const secretMatch = envContent.match(/CRON_SECRET\s*=\s*(.*)/);
  if (secretMatch) cronSecret = secretMatch[1].trim();
}

if (!cronSecret) {
  // Let's print a warning but continue if we want to test
  console.log('⚠️ CRON_SECRET not found in .env.local. If the endpoint strictly requires it, request will fail with 401.');
}

const isDryRun = process.argv.includes('--dryRun') || process.argv.includes('--dry-run');
const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const url = `${baseUrl}/api/cron/daily-scan${isDryRun ? '?dryRun=true' : ''}`;

console.log(`📡 Triggering daily scan at: ${url}`);

async function main() {
  const headers = {
    'Content-Type': 'application/json',
  };
  if (cronSecret) {
    headers['Authorization'] = `Bearer ${cronSecret}`;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
  });

  const status = res.status;
  const text = await res.text();
  
  console.log(`\nResponse Status: ${status}`);
  try {
    const data = JSON.parse(text);
    console.log('Response JSON:', JSON.stringify(data, null, 2));
  } catch {
    console.log('Response Text:', text);
  }
}

main().catch(err => {
  console.error('❌ Request failed:', err);
});
