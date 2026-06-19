# Faz 1: Mentor Asistan — Temel Zekâ + Terapötik Persona

**Tarih:** 2026-06-19
**Durum:** Tasarım (onay bekliyor)
**Kapsam:** "C — Tam günlük-hayat asistanı" hedefinin Faz 1'i. (Faz 2 = RAG bilgi tabanı, Faz 3 = proaktif çok-alan, Faz 4 = uzun-vadeli kişiselleşme. Her faz kendi spec→plan→impl döngüsü.)

## Context (neden)

Telegram mentor asistanı çalışıyor ama "yarım akıllı":
- **Bug:** Kullanıcı "Selam" yazdı; bot onu **günlük taahhüt** sanıp "kaçta yapıyorsun?" diye sordu. [route.ts default case](../../../src/app/api/telegram/route.ts) taahhüt state-machine'i, placeholder durumdayken **her serbest metni taahhüt olarak yakalıyor**.
- [classifyQuestion.ts](../../../src/lib/assistant/classifyQuestion.ts) yalnızca *hayat vs iş* ayırıyor; **selamlama/sohbet/meta intent yok** ve **konuşma geçmişini kullanmıyor** (`void _history`).
- Persona generic; Cem'in fiilen kullandığı terapötik çerçevelere (ACT/DBT/MI/GROW/pozitif psik) dayanmıyor.

Hedef: asistanı sadece-uygulama yardımcısından **günlük hayat mentoru** kalitesine taşıyan ilk sıçrama. "Eğitmek" = fine-tune DEĞİL (OpenRouter LLM); persona/metod + intent zekâsı + (sonraki fazda) RAG.

## Kapsam (yalnızca Faz 1)

1. Intent guard + commitment-capture düzeltmesi (görünür bug)
2. History-aware routing
3. Persona + terapötik metod distilasyonu
4. Terapötik guardrail'ler (kriz / teşhis-yok / sınır)
5. `Hakkımda.txt` → **anonimleştirilmiş** persona özeti (ham metin asla OpenRouter'a gitmez)

## Tasarım

### 1. Intent guard (bug fix)
Yeni hafif sınıflandırıcı `classifyMessageIntent(text, history)` (yeni `src/lib/assistant/intent.ts`). Kategoriler: `greeting`, `smalltalk`, `meta` (yetenek sorusu), `commitment_candidate`, `question`, `command`.
- Önce LLM'siz heuristik (greeting listesi: selam/merhaba/günaydın/nasılsın/naber…; soru işareti; komut; çok kısa metin), belirsizse tek ucuz LLM (mevcut `callLight` deseni).
- [route.ts default case](../../../src/app/api/telegram/route.ts): taahhüt yakalama YALNIZCA (a) sabah commitment akışı placeholder aktif **VE** (b) `intent === 'commitment_candidate'` iken yapılır. `greeting/question/smalltalk/meta` → taahhüt OLARAK YAKALANMAZ.
- `greeting` → sıcak selam yanıtı (taahhüt sormaz). `meta` → yetenek özeti. `smalltalk/question` → mentor free-text.

Yeniden kullanım: `telegramCommandParser.ts`, `classifyQuestion.ts` deseni, `callLight`.

### 2. History-aware routing
[classifyQuestion.ts](../../../src/lib/assistant/classifyQuestion.ts) `_history`'yi kullansın: son N tur LLM tie-breaker prompt'una eklensin ki takip soruları ("peki ya o?", "tamam, ne zaman?") bağlam görsün. `runMentorFreeText` zaten history alıyor — doğrula.

### 3. Persona + metod
[prompts.ts](../../../src/lib/assistant/prompts.ts) `buildMentorSystemPrompt` yeniden yazılır; damıtılmış terapötik metod bloğu (Cem'in masaüstündeki manüellerden distilasyon):
- **MI (Motivational Interviewing):** öğüt yağdırma yok; açık uçlu sor, değişim konuşmasını evoke et, ambivalansı normalize et.
- **ACT:** değerlere bağla, defüzyon, kaçınma yerine kabul.
- **DBT:** yüksek sıkıntıda önce regülasyon (TIP/STOP), sonra problem çözme.
- **GROW:** her iş/karar için Hedef→Gerçeklik→Seçenekler→İrade mikro-çerçevesi.
- **Pozitif psikoloji:** güçlü yön + küçük kazanç vurgusu.
- **Erkek gelişimi (KWML/Jung) tonu:** sorumluluk, disiplin, şefkatli sertlik.

**Anonim persona context:** `Hakkımda.txt` implementasyon sırasında lokal okunur; ondan **ham olmayan** özet çıkarılır (değerler, hedefler, tetikleyiciler, tercih edilen ton). Ham metin koda/DB'ye/prompt'a KONULMAZ. Özet `src/data/personaContext.ts` (server-only sabit) veya LIFE DB gizli satırda tutulur, prompt'a enjekte edilir.

### 4. Guardrail'ler
- Kriz/öz-zarar sinyali → sıcak, yargısız yanıt + profesyonel/acil yönlendirme (TR acil hatları); asistan teşhis/ilaç ÖNERMEZ.
- "Terapist yerine geçmem" sınırı; aşırı vaat yok; mahremiyet.
- Guardrail metni `buildMentorSystemPrompt` hard-rules bloğunda (mevcut MENTOR_HARD_RULES deseni).

## Veri akışı
inbound → parse → **classifyMessageIntent** → (greeting/meta → yapısal yanıt) | (commitment akışı yalnız `commitment_candidate`) | classifyQuestion(history) → mentor free-text (persona+metod+anon context) | business council → reply.

## Dosyalar
- `src/lib/assistant/intent.ts` (yeni) — `classifyMessageIntent`
- `src/lib/assistant/classifyQuestion.ts` — history wire
- `src/lib/assistant/prompts.ts` — `buildMentorSystemPrompt` rewrite + persona context + guardrail
- `src/app/api/telegram/route.ts` — default case intent guard
- `src/data/personaContext.ts` (yeni, server-only, anonim) VEYA LIFE DB `assistant_persona`

## Test
- Unit `classifyMessageIntent`: greeting/smalltalk/meta/commitment/question/command TR vakaları.
- Unit commitment-capture guard: "Selam"/"merhaba"/"nasılsın" → taahhüt OLMAZ; gerçek cümle ("sunum taslağını bitireceğim") → taahhüt olur.
- Unit `classifyQuestion` history etkisi.
- Guardrail: kriz tetikleyici metinde yönlendirme cümlesi üretilir (prompt içerik testi).
- Regresyon: mevcut 201 test yeşil kalmalı.

## Kapsam dışı (sonraki fazlar)
RAG/embedding (Faz 2), proaktif çok-alan + takvim/sağlık/finans döngüleri (Faz 3), uzun-vadeli desen öğrenme/haftalık retro (Faz 4), lokal LLM.

## Gizlilik
`Hakkımda.txt` ham metni hiçbir zaman OpenRouter'a gitmez — yalnız anonim özet. "Tam lokal embedding" kararı Faz 2'ye ertelendi (Vercel serverless + OpenRouter'ın metni zaten görmesi ile çelişkisi orada çözülecek).
