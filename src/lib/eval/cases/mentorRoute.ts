// Golden: mentor yönlendirme parity kilidi. classifyMessageIntent (niyet) ve
// routeMessageToAgent (persona) saf/deterministik fonksiyonlardır; Brain v2
// router'ı bunları strateji olarak sardığında çıktılar değişmemeli.

import { classifyMessageIntent, type MessageIntent } from '../../assistant/intent'
import { routeMessageToAgent, type AgentType } from '../../assistant/agents'
import { makeGoldenSet } from '../harness'

export const intentGolden = makeGoldenSet<string, MessageIntent>({
  name: 'mentor.intent',
  fn: classifyMessageIntent,
  cases: [
    { name: 'komut', input: '/plan', expected: 'command' },
    { name: 'selam', input: 'Selam', expected: 'greeting' },
    { name: 'nasilsin', input: 'nasılsın', expected: 'greeting' },
    { name: 'meta', input: 'ne yapabilirsin?', expected: 'meta' },
    { name: 'soru', input: 'bugün ne yapmalıyım?', expected: 'question' },
    { name: 'taahhut-cue', input: 'Yarın müşteriye teklif göndereceğim', expected: 'commitment_candidate' },
    { name: 'bos', input: '', expected: 'smalltalk' },
    { name: 'kisa-smalltalk', input: 'ok', expected: 'smalltalk' },
  ],
})

export const personaGolden = makeGoldenSet<string, AgentType>({
  name: 'mentor.persona',
  fn: routeMessageToAgent,
  cases: [
    { name: 'health', input: 'Vitaminlerimi hatırlat', expected: 'health' },
    { name: 'content', input: 'Bana bir Reels hook fikri ver', expected: 'content' },
    { name: 'business', input: 'Retainer müşteri için teklif taslağı', expected: 'business' },
    { name: 'academy', input: 'Beykent final planım', expected: 'academy' },
    { name: 'learning', input: 'n8n otomasyon öğrenmek istiyorum', expected: 'learning' },
    { name: 'library', input: '10 sayfa kitap okudum', expected: 'library' },
    { name: 'execution', input: 'Bugün ne yapmalıyım', expected: 'execution' },
    { name: 'mentor-fallback', input: 'Selam', expected: 'mentor' },
  ],
})
