"use client";

import { useState, useEffect, useCallback } from "react";
import { Sparkles, RefreshCw, Zap, Flame, Shield } from "lucide-react";

interface BriefData {
  energySummary: string;
  criticalActions: string[];
  mentorNote: string;
}

interface DailyAiBriefCardProps {
  completedRoutines: number;
  totalRoutines: number;
  activeTasks: number;
  completedTasks: number;
  willpowerScore: number;
}

function generateLocalBrief(
  energy: "LOW" | "NORMAL" | "HIGH",
  completedRoutines: number,
  totalRoutines: number,
  activeTasks: number,
  completedTasks: number,
  willpowerScore: number
): BriefData {
  const completionPercent = totalRoutines > 0 ? Math.round((completedRoutines / totalRoutines) * 100) : 0;
  
  let energySummary = "";
  let criticalActions: string[] = [];
  let mentorNote = "";

  if (energy === "LOW") {
    energySummary = `Düşük enerji modundayız Cem. ${completedRoutines}/${totalRoutines} rutin tamamlandı (%${completionPercent}). Bugün kendini yıpratmadan, ritmi bozmayacak şekilde ilerliyoruz.`;
    criticalActions = [
      completedRoutines < totalRoutines ? "Vitaminlerini ve suyunu içerek temel biyolojini koru." : "Temel rutinlerini tamamladın, harika!",
      completedTasks < activeTasks ? "Bugünün en kritik görevine 15 dakika odaklanıp bırak." : "Görevi tamamladın, daha fazla zorlama.",
      "Günü kapatırken sakin bir zihinle duanı et ve dinlenmeye geç."
    ];
    mentorNote = "Cem, düşük enerji günlerinde kahramanlık aramıyoruz. Sistemi bozmamak, 0'dan büyük olmak en büyük kazançtır. Rahat ol abi.";
  } else if (energy === "HIGH") {
    energySummary = `Atak ve üretim günümüz Cem! ${completedRoutines}/${totalRoutines} rutin kapandı (%${completionPercent}). İrade gücün ${willpowerScore} puanda!`;
    criticalActions = [
      completedRoutines < totalRoutines ? "Kalan rutinleri hızla eritip zihnini tamamen boşalt." : "Rutinlerin tamamı kapandı, odaklanmaya hazırsın!",
      completedTasks < activeTasks ? "Bugünün Kilidi görevini tamamla ve Grafikcem hedeflerine darbe indir." : "Kilit görevi erittin, şahane performans!",
      "Öğrenme ritmini (İngilizce/next.js) besle ve duayla günü taçlandır."
    ];
    mentorNote = "Enerjin yüksek, kaslar sıcak Cem. Grafikcem'i 120k TL hedefine uçuracak o kritik odak bloklarını bugün tam konsantrasyonla tamamlayalım. Gazamız mübarek olsun!";
  } else {
    energySummary = `Dengeli ritim günündeyiz Cem. Rakamlar: ${completedRoutines}/${totalRoutines} rutin (%${completionPercent}), İrade Kası: ${willpowerScore} puan.`;
    criticalActions = [
      completedRoutines < totalRoutines ? "Vitamin, su ve cilt bakımı rutinlerini çizgi gibi koru." : "Sağlık ve disiplin rutinlerin tamam, harika!",
      completedTasks < activeTasks ? "Odak projelerinde sıradaki en önemli adıma geç." : "Kritik görev tamamlandı, ritmi bozma.",
      "Kitabını açıp 15 sayfa oku ve gün sonu duasını aksatma."
    ];
    mentorNote = "Acele etmeden ama ertelemeden, adım adım günü kazanıyoruz Cem. Sistem çalışıyor, sen takip et yeter. Yanındayım abi.";
  }

  return { energySummary, criticalActions, mentorNote };
}

export function DailyAiBriefCard({
  completedRoutines,
  totalRoutines,
  activeTasks,
  completedTasks,
  willpowerScore
}: DailyAiBriefCardProps) {
  const [brief, setBrief] = useState<BriefData | null>(null);
  const [loading, setLoading] = useState(false);
  const [energyLevel, setEnergyLevel] = useState<"LOW" | "NORMAL" | "HIGH">("NORMAL");

  // Read energy level from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("feed-the-goat-energy");
      if (stored === "LOW" || stored === "HIGH" || stored === "NORMAL") {
        // reads persisted energy level from localStorage on mount — intentional external→React sync
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setEnergyLevel(stored);
      }
    } catch { /* ignore */ }
  }, []);

  const generateBrief = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10);
    const progressHash = `${completedRoutines}-${totalRoutines}-${activeTasks}-${completedTasks}-${willpowerScore}`;
    const cacheKey = `feed-the-goat-mentor-brief-${today}-${progressHash}`;

    let latestEnergy = energyLevel;
    try {
      const stored = localStorage.getItem("feed-the-goat-energy");
      if (stored === "LOW" || stored === "HIGH" || stored === "NORMAL") {
        latestEnergy = stored;
        if (latestEnergy !== energyLevel) {
          setEnergyLevel(latestEnergy);
        }
      }
    } catch {}

    setLoading(true);
    try {
      const res = await fetch("/api/ai/mentor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "brief",
          energyLevel: latestEnergy,
          completedRoutinesCount: completedRoutines,
          totalRoutinesCount: totalRoutines,
          activeTasksCount: activeTasks,
          completedTasksCount: completedTasks,
          willpowerScore
        })
      });

      if (res.ok) {
        const data = await res.json() as BriefData;
        setBrief(data);
        sessionStorage.setItem(cacheKey, JSON.stringify(data));
      } else {
        // Use local fallback
        const local = generateLocalBrief(energyLevel, completedRoutines, totalRoutines, activeTasks, completedTasks, willpowerScore);
        setBrief(local);
      }
    } catch (e) {
      console.error(e);
      // Use local fallback
      const local = generateLocalBrief(energyLevel, completedRoutines, totalRoutines, activeTasks, completedTasks, willpowerScore);
      setBrief(local);
    } finally {
      setLoading(false);
    }
  }, [energyLevel, completedRoutines, totalRoutines, activeTasks, completedTasks, willpowerScore]);

  // Load from cache or generate local first, then fetch AI in background
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const progressHash = `${completedRoutines}-${totalRoutines}-${activeTasks}-${completedTasks}-${willpowerScore}`;
    const cacheKey = `feed-the-goat-mentor-brief-${today}-${progressHash}`;

    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        // reads cached brief from sessionStorage on mount — intentional external→React sync
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setBrief(JSON.parse(cached));
      } else {
        // Set local instantly
        const local = generateLocalBrief(energyLevel, completedRoutines, totalRoutines, activeTasks, completedTasks, willpowerScore);
        setBrief(local);
        
        // Fetch AI in background
        generateBrief();
      }
    } catch {
      const local = generateLocalBrief(energyLevel, completedRoutines, totalRoutines, activeTasks, completedTasks, willpowerScore);
      setBrief(local);
    }
  }, [energyLevel, completedRoutines, totalRoutines, activeTasks, completedTasks, willpowerScore, generateBrief]);

  // Color helper based on energy level
  const energyBadgeColor =
    energyLevel === "LOW"
      ? "text-[#ff453a] bg-[#ff453a]/10 border-[#ff453a]/20"
      : energyLevel === "HIGH"
      ? "text-[#ff9f0a] bg-[#ff9f0a]/10 border-[#ff9f0a]/20"
      : "text-[#34c759] bg-[#34c759]/10 border-[#34c759]/20";

  const energyIcon =
    energyLevel === "LOW" ? (
      <Shield size={10} className="mr-1" />
    ) : energyLevel === "HIGH" ? (
      <Flame size={10} className="mr-1" />
    ) : (
      <Zap size={10} className="mr-1" />
    );

  const energyLabel =
    energyLevel === "LOW"
      ? "Minimum Gün (Koruma)"
      : energyLevel === "HIGH"
      ? "Atak Günü (Agresif)"
      : "Dengeli Gün (Ritim)";

  return (
    <div className="w-full bg-[#0D0D0D] border border-[#1A1A1A] rounded-2xl overflow-hidden p-5 transition-all duration-300 hover:border-[#222]">
      <div className="flex items-center justify-between mb-3.5">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-[var(--accent)] animate-pulse" />
          <h2 className="text-xs uppercase tracking-widest text-[#777] font-semibold">
            Bugün Cem İçin
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className={`flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border ${energyBadgeColor}`}>
            {energyIcon}
            {energyLabel}
          </span>
          <button
            onClick={() => generateBrief()}
            disabled={loading}
            className="text-[#555] hover:text-white transition-colors p-1 rounded-lg disabled:opacity-40 cursor-pointer"
            title="AI Planını Yenile"
          >
            <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {loading && !brief && (
        <div className="space-y-3 py-2">
          <div className="h-4 w-3/4 rounded bg-[#151515] animate-pulse" />
          <div className="space-y-2">
            <div className="h-3 w-5/6 rounded bg-[#151515] animate-pulse" />
            <div className="h-3 w-2/3 rounded bg-[#151515] animate-pulse" />
          </div>
          <div className="h-3.5 w-1/2 rounded bg-[#151515] animate-pulse mt-4" />
        </div>
      )}

      {brief && (
        <div className="space-y-3.5 animate-in fade-in duration-300">
          {/* Energy Summary */}
          <p className="text-xs text-[#888] font-medium leading-relaxed">
            {brief.energySummary}
          </p>

          {/* Action Steps */}
          {brief.criticalActions && brief.criticalActions.length > 0 && (
            <ul className="space-y-2">
              {brief.criticalActions.slice(0, 3).map((action, idx) => (
                <li key={idx} className="flex items-start gap-2.5 text-[13px] text-[#CCC] leading-relaxed">
                  <span className="flex items-center justify-center w-4 h-4 rounded-full bg-[#1A1A1A] text-[9px] text-[var(--accent)] font-bold border border-[#252525] mt-px">
                    {idx + 1}
                  </span>
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Separator */}
          <div className="h-px bg-[#161616] my-1" />

          {/* Mentor Note */}
          <div className="bg-[#12110A] border border-[#221D0E]/60 rounded-xl px-3 py-2.5">
            <span className="text-[9px] uppercase tracking-wider text-[var(--accent)] font-semibold block mb-0.5">
              Mentor Notu
            </span>
            <p className="text-xs text-[#A1A19D] leading-relaxed italic">
              &quot;{brief.mentorNote}&quot;
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
