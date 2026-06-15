import { callOpenRouter } from "@/lib/assistant/llm";
import { buildDynamicSystemPrompt, type DailyPromptContext } from "./prompts";
import { lifeSupabaseAdmin as supabaseAdmin } from "@/lib/lifeSupabaseAdmin";
import { WORKOUT_DAYS } from "@/data/healthProtocol";
import { getIstanbulDateAndDay } from "./timezone";
import { normalizeCourse, buildSummary, triageCourse, upcomingExams, getAcademicLock, FORMULAS, getMatchedExamForLock, formatExamRiskText, type NormalizedCourse, type UpcomingExam } from "@/lib/academic";

export type AgentMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/** Shared context passed to every subagent. Mirrors DailyPromptContext used by buildDynamicSystemPrompt. */
export type AgentContext = DailyPromptContext;

// 1. Health & Supplement Agent
export async function runHealthAgent(messages: AgentMessage[], ctx: AgentContext): Promise<string> {
  let isWorkout = false;
  let waterTarget = 3000;
  let proteinTarget = 150;
  
  try {
    const { dow } = getIstanbulDateAndDay();
    isWorkout = WORKOUT_DAYS.has(dow);
    
    // Load sport targets
    const { data: sport } = await supabaseAdmin
      .from("sport_state")
      .select("water_target_ml, protein_target_g")
      .eq("id", 1)
      .maybeSingle();
      
    if (sport) {
      waterTarget = sport.water_target_ml ?? 3000;
      proteinTarget = sport.protein_target_g ?? 150;
    }
  } catch {}

  const dynamicCtx = {
    ...ctx,
    healthData: {
      isWorkoutDay: isWorkout,
      waterTargetMl: waterTarget,
      proteinTargetG: proteinTarget
    }
  };

  const systemPrompt = buildDynamicSystemPrompt("health", dynamicCtx);
  
  const reply = await callOpenRouter([
    { role: "system", content: systemPrompt },
    ...messages
  ], { maxTokens: 400, temperature: 0.4 });

  return reply ?? "Cem, sağlık/cilt veya supplement durumumuza şu an ulaşamadım ama temel kuralımızı biliyorsun: Vitaminlerini iç, suyunu 3L'ye yaklaştır, cilt bakımını tamamla ve antrenman günü ise spora git.";
}

// 2. Daily Execution Agent
export async function runExecutionAgent(messages: AgentMessage[], ctx: AgentContext): Promise<string> {
  const activeTasksList: string[] = [];
  const completedTasksList: string[] = [];
  
  try {
    const { data: tasks } = await supabaseAdmin
      .from("active_tasks")
      .select("title, is_done, is_priority")
      .order("is_priority", { ascending: false });

    if (tasks) {
      tasks.forEach((t: { title: string; is_done: boolean | null; is_priority: boolean | null }) => {
        const itemStr = `${t.is_priority ? "⭐ " : ""}${t.title}`;
        if (t.is_done) {
          completedTasksList.push(itemStr);
        } else {
          activeTasksList.push(itemStr);
        }
      });
    }
  } catch {}

  const executionContext = `
=== GERÇEK GÖREV DURUMU ===
Cem'in bugünkü aktif görevleri şunlardır:
Aktif Kilit ve Projeler:
${activeTasksList.length > 0 ? activeTasksList.map(t => `- ${t}`).join("\n") : "Aktif görev yok."}

Bugün Tamamlanan Görevler:
${completedTasksList.length > 0 ? completedTasksList.map(t => `- ${t}`).join("\n") : "Henüz tamamlanan görev yok."}

ADHD UYARISI:
- Cem'e asla görev yığma!
- Öncelikli olarak sadece en üstteki "⭐" veya ilk sıradaki kilit göreve odaklanmasını sağla.
- Sistemi bozmadan ilerlemesi için tek seferde en fazla 3 minimal aksiyon ver.
`;

  const systemPrompt = buildDynamicSystemPrompt("execution", ctx) + "\n" + executionContext;
  
  const reply = await callOpenRouter([
    { role: "system", content: systemPrompt },
    ...messages
  ], { maxTokens: 400, temperature: 0.4 });

  return reply ?? "Cem, görev listemize şu an erişemedim ama kuralı biliyorsun: Bugünün kilit işini bitirip rutinlerimizi korumak günü kazanmaya yeterlidir.";
}

// 3. Kreatif & İçerik Agent
export async function runContentAgent(messages: AgentMessage[], ctx: AgentContext): Promise<string> {
  const systemPrompt = buildDynamicSystemPrompt("content", ctx);
  
  const reply = await callOpenRouter([
    { role: "system", content: systemPrompt },
    ...messages
  ], { maxTokens: 450, temperature: 0.5 });

  return reply ?? "Cem, içerik planına şu an bakamıyorum ama Grafikcem marka tonunu hatırla: Sadece değer odaklı carousel hook'u tasarla ve prompt isterse promptu İngilizce üret.";
}

// 4. İş Geliştirme (Business) Agent
export async function runBusinessAgent(messages: AgentMessage[], ctx: AgentContext): Promise<string> {
  const systemPrompt = buildDynamicSystemPrompt("business", ctx);
  
  const reply = await callOpenRouter([
    { role: "system", content: systemPrompt },
    ...messages
  ], { maxTokens: 400, temperature: 0.4 });

  return reply ?? "Cem, BizDev veritabanına erişemedim ama 120k TL retainer hedeflerimiz için teklif hazırlarken revize/kapsam netliğini sakın atlama. Teklifi senin onayına bıraktım.";
}

// 5. Gelişim & Öğrenme Agent
export async function runLearningAgent(messages: AgentMessage[], ctx: AgentContext): Promise<string> {
  const systemPrompt = buildDynamicSystemPrompt("learning", ctx);
  
  const reply = await callOpenRouter([
    { role: "system", content: systemPrompt },
    ...messages
  ], { maxTokens: 400, temperature: 0.4 });

  return reply ?? "Cem, gelişim yolculuğuna şu an bakamadım ama bugünün İngilizce mini ritmini (kelime/cümle) ve 15 dk'lık Next.js/otomasyon pratik adımlarını unutma.";
}

// 6. Kütüphane & Okuma Agent
export async function runLibraryAgent(messages: AgentMessage[], ctx: AgentContext): Promise<string> {
  let activeBook = "Bir Tek Şey";
  try {
    const { data: book } = await supabaseAdmin
      .from("active_books")
      .select("title")
      .eq("is_active", true)
      .maybeSingle();
    if (book) {
      activeBook = book.title;
    }
  } catch {}

  const libraryContext = `
=== AKTİF KİTAP BAĞLAMI ===
- Cem'in şu an okuduğu aktif kitap: ${activeBook}
- Günlük hedef: 15 sayfa (veya düşük enerji günlerindeyse sadece 5 sayfa).
- Okuma sonrası: Cem'e bu sayfadan aklında kalan en vurucu notu/çıkarımı kaydetmesini öner.
`;

  const systemPrompt = buildDynamicSystemPrompt("library", ctx) + "\n" + libraryContext;
  
  const reply = await callOpenRouter([
    { role: "system", content: systemPrompt },
    ...messages
  ], { maxTokens: 400, temperature: 0.4 });

  return reply ?? `Cem, kitap kütüphanene erişemedim ama ${activeBook} kitabından bugün 15 sayfa okuyup en vurucu notunu buraya yazarak zihnini besleyebilirsin.`;
}

// 7. Core Mentor & Orchestrator Agent
export async function runMentorAgent(messages: AgentMessage[], ctx: AgentContext): Promise<string> {
  const systemPrompt = buildDynamicSystemPrompt("mentor", ctx);
  
  const reply = await callOpenRouter([
    { role: "system", content: systemPrompt },
    ...messages
  ], { maxTokens: 450, temperature: 0.5 });

  return reply ?? "Cem, Chief of Staff olarak yanındayım. API kesintisi olsa bile sistemi bozmadan vitaminlerini iç, suyunu 3L tamamla ve bugünün kilit işine ufak bir adım at abi.";
}

// 8. Academy Coach Subagent
export async function runAcademyAgent(messages: AgentMessage[], ctx: AgentContext): Promise<string> {
  let beykentText = "";
  let aofText = "";
  let upcomingExamsText = "";

  let normCoursesByk: NormalizedCourse[] = [];
  let normCoursesAof: NormalizedCourse[] = [];
  let upcoming: UpcomingExam[] = [];
  let dbError = false;

  // ── USER INTENT PARSING ───────────────────────────────────────────────────
  const lastUserMsg = [...messages].reverse().find(m => m.role === "user")?.content || "";
  const lastMsgLower = lastUserMsg.toLowerCase();

  let intent: "beykent" | "aof" | "esertifika" | "general" = "general";
  if (lastMsgLower.includes("e-sertifika") || lastMsgLower.includes("esertifika") || lastMsgLower.includes("sertifika")) {
    intent = "esertifika";
  } else if (lastMsgLower.includes("aöf") || lastMsgLower.includes("aof") || lastMsgLower.includes("anadolu") || lastMsgLower.includes("bütünleme") || lastMsgLower.includes("butunleme") || lastMsgLower.includes("ff")) {
    intent = "aof";
  } else if (lastMsgLower.includes("beykent") || lastMsgLower.includes("final") || lastMsgLower.includes("stüdyo") || lastMsgLower.includes("studyo")) {
    intent = "beykent";
  }

  try {
    const { data: uniByk } = await supabaseAdmin
      .from("universities")
      .select("*")
      .eq("slug", "beykent")
      .single();

    if (uniByk) {
      const { data: courses } = await supabaseAdmin
        .from("courses")
        .select("*")
        .eq("university_id", uniByk.id)
        .order("subsection", { ascending: true, nullsFirst: true })
        .order("created_at", { ascending: true });

      normCoursesByk = (courses || []).map(normalizeCourse);
      const summary = buildSummary(normCoursesByk);
      const active = normCoursesByk.filter(c => c.status === "in_progress" && !c.notes?.includes("bırakıldı"));
      const triaged = active.map(c => ({ c, t: triageCourse(c, FORMULAS.beykent) }));
      const deferred = normCoursesByk.filter(c => c.status === "in_progress" && c.notes?.includes("bırakıldı"));

      beykentText = `
=== BEYKENT ÜNİVERSİTESİ (Görsel İletişim Tasarımı) ===
- Kalan Ders Sayısı: ${summary.remaining}
- Aktif Sınav/Final Dersleri: ${active.filter(c => c.gradeType === "exam").map(c => c.name).join(", ") || "Yok"}
- Ertelenen Proje Dersleri (Seneye Bırakılanlar):
${deferred.length > 0 ? deferred.map(c => `  * ${c.name} (${c.notes || "Güz dönemine ertelendi"})`).join("\n") : "  * Yok"}
- Ders Başına Durum ve Final Gereksinimi:
${triaged.map(item => {
  const req = item.t.requiredFinal !== null ? `(Finalden gereken min not: ${item.t.requiredFinal})` : "";
  return `  * ${item.c.name}: ${item.t.message} ${req}`;
}).join("\n")}
`;
    } else {
      dbError = true;
    }
  } catch {
    dbError = true;
    beykentText = "Beykent verisi okunamadı.\n";
  }

  try {
    const { data: uniAof } = await supabaseAdmin
      .from("universities")
      .select("*")
      .eq("slug", "aof")
      .single();

    if (uniAof) {
      const { data: courses } = await supabaseAdmin
        .from("courses")
        .select("*")
        .eq("university_id", uniAof.id)
        .order("subsection", { ascending: true, nullsFirst: true })
        .order("created_at", { ascending: true });

      normCoursesAof = (courses || []).map(normalizeCourse);
      const mainCourses = normCoursesAof.filter(c => c.subsection !== "e-sertifika");
      const failed = mainCourses.filter(c => c.status === "failed");
      const eSertifika = normCoursesAof.filter(c => c.subsection === "e-sertifika");

      aofText = `
=== ANADOLU AÖF (Halkla İlişkiler ve Reklamcılık) ===
- Kalan / Tekrar Alınacak FF Ders Sayısı: ${failed.length}
- Tekrar Alınacak Ders Listesi: ${failed.map(c => c.name).join(", ") || "Yok"}
- e-Sertifika Başvuru / Ders Planı:
${eSertifika.length > 0 ? eSertifika.map(c => `  * ${c.name} (${c.notes || "Güz dönemi planı"})`).join("\n") : "  * Yok"}
`;
    } else {
      dbError = true;
    }
  } catch {
    dbError = true;
    aofText = "AÖF verisi okunamadı.\n";
  }

  try {
    const { data: exams } = await supabaseAdmin
      .from("exams")
      .select("*, courses(name)")
      .order("exam_date", { ascending: true });

    if (exams) {
      const now = new Date();
      upcoming = upcomingExams(exams, now);
      if (upcoming.length > 0) {
        upcomingExamsText = `
=== YAKLAŞAN SINAVLAR VE GÜN SAYILARI ===
${upcoming.map(e => `- ${e.title} (${e.courses?.name || "Genel Sınav/Event"}): ${new Date(e.exam_date).toLocaleDateString("tr-TR")} (${e.daysLeft} gün kaldı)${e.confirmed === false ? " [TAHMİNİ]" : ""}`).join("\n")}
`;
      } else {
        upcomingExamsText = "\n=== YAKLAŞAN SINAV / ETKİNLİK BULUNMADI ===\n";
      }
    } else {
      dbError = true;
    }
  } catch {
    dbError = true;
    upcomingExamsText = "Sınav takvimi okunamadı.\n";
  }

  // If database failed completely and no courses are loaded
  if (dbError && normCoursesByk.length === 0 && normCoursesAof.length === 0) {
    return "Cem, şu an Supabase veritabanımıza bağlantıda bir sorun yaşıyorum, bu yüzden güncel akademik ders ve sınav verilerine erişemedim. Tarih veya puan uydurmamak adına takvim kesin değil diyorum. İnternet durumunu kontrol edip tekrar sorabilirsin abi.";
  }

  const academicContext = `
=== GERÇEK AKADEMİK VERİ BAĞLAMI (SUPABASE) ===
${beykentText}
${aofText}
${upcomingExamsText}

=== KULLANICI ODAĞI / USER INTENT ===
Sistem tarafından otomatik algılanan odak: ${intent.toUpperCase()}
AÖF sınav ve FF ders sorularında AÖF bütünleme önceliklerini seçmeli, Beykent plan taleplerinde ise Beykent final stüdyo durumlarını vurgulamalısın.

ADHD VE AKADEMİ KURALLARI:
- Cem'e asla uzun ders listeleri veya yorucu müfredatlar çıkarma! ADHD'yi tetikler.
- Planları "git ders çalış" gibi genel yapma! "Hangi ders + kaç dakika + ne çıktı" şeklinde net ve mikro aksiyonlar öner.
- Tarih, ders ve sınav bilgisi uydurma. Eğer Supabase'de veri yoksa veya kesin değilse "takvim kesin değil / Supabase verisi eksik" de.
- Cevap formatı KESİNLİKLE şu ADHD dostu şablonda 4 madde halinde olmalı (bunu Cem'e sunarken 4 maddelik net başlıklar kullan):
  1. Bugün Tek Akademik Kilit: (Hangi ders çalışılacak, neden çalışılacak, yaklaşan tarihi ne)
  2. 25 Dakikalık Minimum Çalışma: (25 dakika boyunca yapılacak mikro aksiyon, ne çıktı alınacağı)
  3. Yaklaşan Risk: (En yakın riskli durum veya yaklaşan sınav günü)
  4. Bir Sonraki Kontrol: (Bir sonraki kontrol zamanı veya bir sonraki mikro aksiyon uyarısı)
`;

  const systemPrompt = buildDynamicSystemPrompt("academy", ctx) + "\n" + academicContext;

  let reply = "";
  try {
    reply = await callOpenRouter([
      { role: "system", content: systemPrompt },
      ...messages
    ], { maxTokens: 450, temperature: 0.4 }) || "";
  } catch (e) {
    console.error("OpenRouter API call failed in runAcademyAgent:", e);
  }

  if (!reply) {
    // Generate high-fidelity deterministic fallback plan from Supabase data!
    const lock = getAcademicLock(upcoming, normCoursesByk, normCoursesAof, intent);

    // Use unified match alignment helper to find the exam and detect discrepancies
    const matchResult = getMatchedExamForLock(lock.courseName, upcoming, intent);
    const matchedExam = matchResult.exam;
    const hasDiscrepancy = matchResult.discrepancy;

    let riskText = "";

    if (hasDiscrepancy) {
      riskText = `Bütünleme sınav verisinde ders eşleşmesi tutarsız; bugün güvenli odak olarak **${lock.courseName}** FF dersi seçildi.`;
    } else if (matchedExam) {
      riskText = formatExamRiskText(matchedExam.title, matchedExam.daysLeft);
    } else {
      // Intent-aware fallback risks when no coursebound exam is found
      if (intent === "aof") {
        riskText = `AÖF bütünleme takvimi kesin course-linked değil / takvim eksik.`;
      } else if (intent === "esertifika") {
        riskText = `e-Sertifika başvuru takvimi kesinleşmedi / Supabase takvimi eksik.`;
      } else if (intent === "beykent") {
        riskText = `Beykent final takvimi kesinleşmedi veya Supabase course-linked sınav verisi eksik.`;
      } else {
        const firstUpcomingTitle = upcoming.length > 0 ? upcoming[0].title : "akademik takvim";
        riskText = `Genel akademik takvim yaklaşıyor (${firstUpcomingTitle}); kesin ders riski için Supabase course-linked sınav verisi eksik.`;
      }
    }

    reply = `Cem, şu an AI bağlantısında bir pürüz var ama endişelenme; gerçek Supabase verilerimizden hazırladığım **Deterministic Akademi Planın** hazır:

1. Bugün Tek Akademik Kilit:
👉 **${lock.courseName}**
*Neden:* ${lock.reason}
*Hedef Tarih:* ${lock.dateStr}

2. 25 Dakikalık Minimum Çalışma:
📝 ${lock.minWork} (Sistemi bozmadan, 25 dakika da sayılır abi!)

3. Yaklaşan Risk:
⚠️ ${riskText}

4. Bir Sonraki Kontrol:
🔄 Sistemi bozmadan ilerliyoruz. Bir sonraki kontrolde ders durumlarımızı ve takvimi tekrar güncelleriz. Ritim bozulmasın yeter!`;
  }

  return reply;
}
