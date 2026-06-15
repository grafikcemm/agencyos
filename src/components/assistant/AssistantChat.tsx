"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Bot } from "lucide-react";
import { QuickActions } from "./QuickActions";

interface Message {
  role: "user" | "assistant";
  content: string;
  agent?: string;
}

const AGENT_LABELS: Record<string, string> = {
  mentor: "Mentor",
  business: "İş Geliştirme",
  health: "Sağlık",
  execution: "İcra",
  content: "İçerik",
  learning: "Gelişim",
  library: "Kütüphane",
  academy: "Akademi",
};

function currentTimeOfDay(): "SABAH" | "ÖĞLEN" | "AKŞAM" | "GECE" {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return "SABAH";
  if (hour >= 11 && hour < 17) return "ÖĞLEN";
  if (hour >= 17 && hour < 22) return "AKŞAM";
  return "GECE";
}

const QUICK_PROMPTS: Record<string, string> = {
  plan: "Bugünü planlamama yardım et. Hangi görevlere odaklanmalıyım?",
  simplify: "Aktif görev listemi sadeleştirmeme yardım et. Fazla var mı?",
  waiting: "Bekleyen görevlerimi nasıl toparlamalıyım?",
  shutdown: "Günü kapatıyorum. Bugünü nasıl değerlendirirsin ve yarın için ne önerirsin?",
  weekly: "Bu haftayı özetler misin? Neleri daha iyi yapabilirim?",
};

export function AssistantChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return;

    const userMsg: Message = { role: "user", content: text.trim() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai/mentor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "chat",
          messages: updated.map((m) => ({ role: m.role, content: m.content })),
          timeOfDay: currentTimeOfDay(),
        }),
      });

      if (res.ok) {
        const data = await res.json() as { reply: string; routedAgent?: string };
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.reply, agent: data.routedAgent },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Bir hata oluştu. Tekrar dene." },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Bağlantı hatası. Tekrar dene." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleQuickAction(action: string) {
    const prompt = QUICK_PROMPTS[action];
    if (prompt) sendMessage(prompt);
  }

  return (
    <div className="bg-[#111111] rounded-xl border border-[#1f1f1f] overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-5 pt-4 pb-3 border-b border-[#1a1a1a]">
        <div className="flex items-center gap-2">
          <Bot size={13} className="text-[#555555]" strokeWidth={1.8} />
          <span className="text-[10px] uppercase tracking-widest text-[#444444] font-medium">
            Asistan
          </span>
        </div>
      </div>

      {/* Quick actions */}
      <div className="px-5 py-3 border-b border-[#1a1a1a]">
        <QuickActions onAction={handleQuickAction} loading={loading} />
      </div>

      {/* Messages */}
      {messages.length > 0 && (
        <div className="px-5 py-3 flex flex-col gap-3 max-h-72 overflow-y-auto">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-[#1a1a1a] text-[#cccccc]"
                    : "bg-[#0f0f0f] border border-[#1a1a1a] text-[#888888]"
                }`}
              >
                {m.role === "assistant" && m.agent && (
                  <span className="text-[9px] uppercase tracking-widest text-[#444444] font-medium block mb-1">
                    {AGENT_LABELS[m.agent] ?? m.agent}
                  </span>
                )}
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl px-3 py-2">
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-[#333333] animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Input */}
      <div className="px-5 py-3 flex items-center gap-2 border-t border-[#1a1a1a]">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage(input)}
          placeholder="Görev yaz veya sor..."
          disabled={loading}
          className="flex-1 bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg px-3 py-2 text-xs text-[#888888]
                     placeholder:text-[#333333] outline-none focus:border-[#2a2a2a] disabled:opacity-50"
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || loading}
          className="w-8 h-8 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center
                     hover:border-[#333333] disabled:opacity-40 transition-colors"
        >
          <Send size={13} className="text-[#555555]" />
        </button>
      </div>
    </div>
  );
}
