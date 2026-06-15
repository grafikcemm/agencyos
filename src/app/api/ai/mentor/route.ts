import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isSameOrigin, checkRateLimit } from "@/lib/commandCenter/security";
import { requireApiAccess } from "@/lib/auth";
import { getCallableCustomers } from "@/lib/assistant/agencyContext";
import { getHabitsOverview } from "@/app/actions/habitActions";

// OpenRouter reasoning modelleri yavaş — 25s LLM timeout'una alan tanı (Vercel).
export const maxDuration = 60;
import { routeMessageToAgent, AgentType } from "@/lib/assistant/agents";
import {
  runHealthAgent,
  runExecutionAgent,
  runContentAgent,
  runBusinessAgent,
  runLearningAgent,
  runLibraryAgent,
  runAcademyAgent,
  runMentorAgent
} from "@/lib/assistant/subagents";

// ── Validation Schemas ────────────────────────────────────────────────────────

const BriefRequestSchema = z.object({
  mode: z.literal("brief"),
  energyLevel: z.enum(["LOW", "NORMAL", "HIGH"]),
  completedRoutinesCount: z.number().default(0),
  totalRoutinesCount: z.number().default(0),
  activeTasksCount: z.number().default(0),
  completedTasksCount: z.number().default(0),
  willpowerScore: z.number().default(0),
  activeBook: z.string().optional(),
  activeProjects: z.array(z.string()).optional(),
  supplementStatus: z.string().optional()
});

const ChatRequestSchema = z.object({
  mode: z.literal("chat"),
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string()
    })
  ),
  activeAgent: z.enum(["mentor", "health", "execution", "content", "business", "learning", "library", "academy"]).optional(),
  energyLevel: z.enum(["LOW", "NORMAL", "HIGH"]).default("NORMAL"),
  timeOfDay: z.enum(["SABAH", "ÖĞLEN", "AKŞAM", "GECE"]).default("SABAH"),
  completedRoutinesCount: z.number().default(0),
  totalRoutinesCount: z.number().default(0),
  activeTasksCount: z.number().default(0),
  completedTasksCount: z.number().default(0),
  willpowerScore: z.number().default(0),
  activeBook: z.string().optional(),
  activeProjects: z.array(z.string()).optional(),
  supplementStatus: z.string().optional()
});

// ── Dynamic Fallbacks ─────────────────────────────────────────────────────────

function getFallbackBrief(energy: "LOW" | "NORMAL" | "HIGH") {
  if (energy === "LOW") {
    return {
      energySummary: "Düşük enerji günündeyiz, bugün sistemi bozmadan minimum gün modundayız Cem.",
      criticalActions: [
        "Rutinlerden şaşma: Vitaminlerini iç ve cilt bakımını tamamla.",
        "Erteleme: Bugünün kilit işini en fazla 15 dk çalışıp bırak.",
        "Gün sonu duanı et, 5 sayfa bile olsa oku ve günü sakin kapat."
      ],
      mentorNote: "Cem, bugün her şeyi bitirmeye çalışma. Ritim bozulmasın, minimum tekrar bile kası sıcak tutar. Rahat ol abi."
    };
  }
  if (energy === "HIGH") {
    return {
      energySummary: "Enerjin tavan Cem, bugün agresif üretim ve atak günümüz!",
      criticalActions: [
        "Rutinlerin tamamını hızlıca kapatıp İrade Kasını besle.",
        "En kritik göreve odaklan ve bitirmeden ekran başından kalkma.",
        "Grafikcem için Reels/içerik üretim aksiyonunu patlat."
      ],
      mentorNote: "Kaslar sıcak, zihin açık. Bugün o retainer müşterileri ve hedefleri zorlayacak üretim bloklarını çıkaralım. Gazamız mübarek olsun!"
    };
  }
  return {
    energySummary: "Dengeli bir gündeyiz Cem. Ritimli ve emin adımlarla ilerliyoruz.",
    criticalActions: [
      "Vitamin, su ve cilt rutinlerini çizgi gibi sürdür.",
      "Odak projelerindeki en önemli 1 ana kilide odaklan.",
      "15 sayfa kitap okuma ve gün sonu kapanış duasını aksatma."
    ],
    mentorNote: "Acele etme, erteleme de. Bugün sistemi bozmadan, disiplini koruyarak günü kazanacağız. Yanındayım abi."
  };
}

const FALLBACK_CHAT_REPLIES: Record<AgentType, string> = {
  mentor: "Cem, şu an AI sunucusunda ufak bir kesinti var ama ben yanındayım. Bugün sistemi bozma, rutinlerini tamamla ve kilit işine ufak bir adım at. Yarın devam ederiz abi.",
  health: "Cem, şu an sağlık protokollerimize ulaşılamıyor ama temel kuralımız net: Vitaminlerini iç, 2.5L suyunu tamamla, cilt bakımını kapat ve antrenman günüyse failure yapmadan spora git. Sağlık her şeydir.",
  execution: "Cem, şu an görev listeni yükleyemedim. Ama bugünü kazanmak için kuralı biliyorsun: En kritik 1 işi tamamla ve sağlık minimumunu kapat.",
  content: "Cem, içerik direktörü şu an meşgul ama Grafikcem marka tonunu unutma: Reels hook'larında ilk 2 saniye çok önemli, carousel'lerde değer odaklı git. Midjourney promptlarında '--ar 4:5 --style raw --v 6.1' eklemeyi unutma.",
  business: "Cem, BizDev sistemi şu an pasif. Ama retainer müşteri hedefimiz (120k TL gelir) için her teklif öncesi kapsamı ve revize hakkını netleştirip sadece taslak üret. Explicit onayın olmadan hiçbir mail atma.",
  learning: "Cem, gelişim merdiveni şu an kilitli ama öğrenme ritmini unutma: İngilizce kelimelerini tekrar et, Next.js veya otomasyon derslerini izlemek yerine ufak bir pratik yap. Günde 15 dk yeter.",
  library: "Cem, kitap okuma odası şu an sakin ama 'Bir Tek Şey' kuralını hatırla. Bugün sadece 15 sayfa oku ve aklında kalan en vurucu notu bir kenara karala. Minimum gün de sayılır!",
  academy: "Cem, akademi koçu şu an dinleniyor ama hedeflerimiz net: Beykent'te kalan dersler ve AÖF'teki FF'leri bütünleme sınavında temizlemek. Ders çalışırken 25 dakikalık bloklar kullan, erteleme abi!"
};

// ── API Route Handler ─────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Oturum auth (giriş kapısı) — gerçek kimlik doğrulama.
  const access = await requireApiAccess(request);
  if ("response" in access) return access.response;
  // CSRF + abuse koruması: tarayıcı-içi same-origin + hafif rate limit (LLM harcaması).
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (checkRateLimit(request, 20)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const modeCheck = z.object({ mode: z.string() }).safeParse(body);
  if (!modeCheck.success) {
    return NextResponse.json({ error: "Missing mode" }, { status: 400 });
  }

  // ── Mode: BRIEF ─────────────────────────────────────────────────────────────
  if (modeCheck.data.mode === "brief") {
    const parsed = BriefRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(getFallbackBrief("NORMAL"));
    }

    const {
      energyLevel,
      completedRoutinesCount,
      totalRoutinesCount,
      activeTasksCount,
      completedTasksCount,
      willpowerScore,
      activeBook,
      activeProjects,
      supplementStatus
    } = parsed.data;

    const ctx = {
      energyLevel,
      completedRoutinesCount,
      totalRoutinesCount,
      activeTasksCount,
      completedTasksCount,
      willpowerScore,
      activeBook,
      activeProjects,
      supplementStatus
    };

    // Brief = DETERMİNİSTİK gerçek veri. deepseek reasoning JSON brief'i 50s'de bile
    // yetişmiyordu (sabah brief'i bekletmemeli). Alışkanlık hatırlatma + bugün aranacak
    // müşteriler doğrudan DB'den — telefon/mail kesin doğru, halüsinasyon yok. Chat LLM kalır.
    void ctx;
    const base = getFallbackBrief(energyLevel);
    const actions: string[] = [];
    try {
      const [habits, callable] = await Promise.all([
        getHabitsOverview(),
        getCallableCustomers(4),
      ]);
      const pending = habits.filter(
        (h) => h.computed.todayStatus !== "not_due" && h.computed.todayStatus !== "done",
      );
      if (pending.length > 0) {
        actions.push(
          `Bugünün alışkanlıkları: ${pending.map((h) => h.label).join(", ")} — zinciri kırma.`,
        );
      }
      for (const c of callable) {
        actions.push(`Ara: ${c.name}${c.loc ? ` (${c.loc})` : ""} — ${c.contact}`);
      }
    } catch (e) {
      console.error("Brief gerçek-veri hatası:", e);
    }
    return NextResponse.json({
      energySummary: base.energySummary,
      criticalActions: actions.length > 0 ? actions : base.criticalActions,
      mentorNote: base.mentorNote,
    });
  }

  // ── Mode: CHAT ──────────────────────────────────────────────────────────────
  if (modeCheck.data.mode === "chat") {
    const parsed = ChatRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({
        reply: "Gönderilen veri formatı uyuşmadı Cem, bir sıkıntı var.",
        routedAgent: "mentor"
      });
    }

    const {
      messages,
      activeAgent,
      energyLevel,
      timeOfDay,
      completedRoutinesCount,
      totalRoutinesCount,
      activeTasksCount,
      completedTasksCount,
      willpowerScore,
      activeBook,
      activeProjects,
      supplementStatus
    } = parsed.data;

    const lastMessage = messages[messages.length - 1]?.content || "";

    // Resolve which agent to use (manual override or auto-routed)
    let resolvedAgent: AgentType = "mentor";
    if (activeAgent && activeAgent !== "mentor") {
      resolvedAgent = activeAgent;
    } else {
      resolvedAgent = routeMessageToAgent(lastMessage);
    }

    const ctx = {
      energyLevel,
      timeOfDay,
      completedRoutinesCount,
      totalRoutinesCount,
      activeTasksCount,
      completedTasksCount,
      willpowerScore,
      activeBook,
      activeProjects,
      supplementStatus
    };

    try {
      let reply = "";
      if (resolvedAgent === "health") {
        reply = await runHealthAgent(messages, ctx);
      } else if (resolvedAgent === "execution") {
        reply = await runExecutionAgent(messages, ctx);
      } else if (resolvedAgent === "content") {
        reply = await runContentAgent(messages, ctx);
      } else if (resolvedAgent === "business") {
        reply = await runBusinessAgent(messages, ctx);
      } else if (resolvedAgent === "learning") {
        reply = await runLearningAgent(messages, ctx);
      } else if (resolvedAgent === "library") {
        reply = await runLibraryAgent(messages, ctx);
      } else if (resolvedAgent === "academy") {
        reply = await runAcademyAgent(messages, ctx);
      } else {
        reply = await runMentorAgent(messages, ctx);
      }

      return NextResponse.json({
        reply,
        routedAgent: resolvedAgent
      });
    } catch (e) {
      console.error("AI Chat Response Error:", e);
      return NextResponse.json({
        reply: FALLBACK_CHAT_REPLIES[resolvedAgent] || FALLBACK_CHAT_REPLIES.mentor,
        routedAgent: resolvedAgent
      });
    }
  }

  return NextResponse.json({ error: "Unknown mode" }, { status: 400 });
}
