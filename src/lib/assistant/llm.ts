export interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenRouterOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

let warnedMissingConfig = false;

export async function callOpenRouter(
  messages: OpenRouterMessage[],
  options: OpenRouterOptions = {}
): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = options.model ?? process.env.OPENROUTER_MODEL;

  if (!apiKey || !model) {
    // Sessizce null dönüp tüm asistanı statik fallback'e düşürmek yerine en az bir kez uyar.
    if (!warnedMissingConfig) {
      warnedMissingConfig = true;
      console.warn(
        '[openrouter] OPENROUTER_API_KEY veya OPENROUTER_MODEL tanımlı değil — asistan LLM yanıtları kapalı, statik fallback kullanılıyor.'
      );
    }
    return null;
  }

  const {
    temperature = 0.3,
    maxTokens = 800,
    // Reasoning modelleri (DeepSeek vb.) 10s'de yetişemiyor — TimeoutError
    // sessiz fallback'in ikinci kök nedeniydi. Route'larda maxDuration ile uyumlu.
    timeoutMs = 25000,
  } = options;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://agencyos.app",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        // Reasoning modelleri (DeepSeek vb.) reasoning kanalına token yakıp
        // content:null dönebiliyor — iki parametre de gönderilir (legacy + güncel).
        include_reasoning: false,
        reasoning: { exclude: true },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      console.error("[openrouter] non-OK response", response.status, model);
      return null;
    }

    const data = await response.json();
    const msg = data?.choices?.[0]?.message;
    let content: string | undefined = msg?.content;
    if (content) {
      content = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    }
    if (!content) {
      console.warn("[openrouter] empty content", {
        finish_reason: data?.choices?.[0]?.finish_reason,
        model,
      });
      return null;
    }
    return content;
  } catch (err) {
    console.error(
      "[openrouter] request failed",
      err instanceof Error ? err.name : "unknown"
    );
    return null;
  }
}

export function extractJSON(text: string): unknown | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}
