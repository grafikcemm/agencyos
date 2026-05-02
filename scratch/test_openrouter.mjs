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

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function callOpenRouter(tier, model, systemPrompt, userPrompt) {
  console.log(`Calling ${tier} (${model})...`);
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      max_tokens: 500
    })
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || response.statusText);
  
  const content = data.choices[0].message.content;
  const inputTokens = data.usage.prompt_tokens;
  const outputTokens = data.usage.completion_tokens;

  // Log cost
  const rates = { light: 0.1/1e6, medium: 0.25/1e6, heavy: 0.5/1e6 };
  const costUsd = (inputTokens + outputTokens) * rates[tier];
  
  await supabase.from('ai_cost_logs').insert({
    operation: 'TEST_CALL',
    model_used: model,
    model_tier: tier,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: costUsd,
    cost_tl: costUsd * 38
  });

  return { content, tokens: inputTokens + outputTokens };
}

async function runTests() {
  console.log('--- TEST 3: OPENROUTER ---');
  try {
    const r1 = await callOpenRouter('light', 'deepseek/deepseek-v4-flash', 'Yardımcı ol.', 'İstanbul Beşiktaş\'ta küçük bir kafe.');
    console.log('✅ callLight: Başarılı - ' + r1.tokens + ' tokens. Yanıt: ' + r1.content.substring(0, 50) + '...');

    const r2 = await callOpenRouter('medium', 'anthropic/claude-haiku-4-5', 'Girişimci ol.', 'Instagram DM taslağı yaz.');
    console.log('✅ callMedium: Başarılı - ' + r2.tokens + ' tokens. Yanıt: ' + r2.content.substring(0, 50) + '...');

    const r3 = await callOpenRouter('heavy', 'deepseek/deepseek-v4-pro', 'Uzman ol.', 'Mini audit yap.');
    console.log('✅ callHeavy: Başarılı - ' + r3.tokens + ' tokens. Yanıt: ' + r3.content.substring(0, 50) + '...');
  } catch (e) {
    console.log('❌ HATA: ' + e.message);
  }
}

runTests();
