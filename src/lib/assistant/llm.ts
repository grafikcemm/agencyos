import { gatewayChat } from "../ai/gateway";

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

// Faz 5 (audit bulgu #4): asistan LLM yolu HER ZAMAN merkezi gateway'den geçer.
// Model artık OPENROUTER_MODEL ham env'inden değil, preset registry'den
// (assistant_chat → agencyos-research: models[] self-heal + retry + fallback
// logu + preset_key'li cost log + aylık tavan). Dönüş sözleşmesi değişmedi:
// başarısızlıkta null (asistanın statik fallback'i devrede kalır).
export async function callOpenRouter(
  messages: OpenRouterMessage[],
  options: OpenRouterOptions = {}
): Promise<string | null> {
  const res = await gatewayChat(messages, {
    model: options.model,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    timeoutMs: options.timeoutMs,
    operation: 'assistant_chat',
  });
  return res.content;
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
