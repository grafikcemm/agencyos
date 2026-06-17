"use client";

import React, { useMemo, useState } from "react";
import { cn } from "@/utils/cn";
import {
  GraduationCap,
  CalendarClock,
  Target,
  ListChecks,
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Flag,
  Award,
} from "lucide-react";
import {
  normalizeCourse,
  buildSummary,
  triageCourse,
  upcomingExams,
  getAcademicLock,
  FORMULAS,
  type RawCourseRow,
  type RawExamRow,
  type NormalizedCourse,
  type AcademicStatus,
  type TriageVerdict,
  type PassingFormula,
} from "@/lib/academic";

// ── Gelen veri (getUniversityData çıktısı) ──────────────────────────────────────
interface UniversityData {
  university: { id: string; name: string; slug: string } | null;
  courses: RawCourseRow[];
  exams: RawExamRow[];
  totalPoints: number;
}

interface AcademyShellProps {
  beykentData: UniversityData | null;
  aofData: UniversityData | null;
  uiMode: 'koruma' | 'denge' | 'atak';
}

type SubTab = "genel" | "beykent" | "anadolu" | "takvim";
type UniKey = "beykent" | "anadolu";
type TaggedExam = RawExamRow & { daysLeft: number; _uni: UniKey };

const UNI_META: Record<UniKey, { label: string; full: string; color: string; slug: string }> = {
  beykent: { label: "Beykent", full: "Görsel İletişim Tasarımı", color: "var(--info)", slug: "beykent" },
  anadolu: { label: "Anadolu (AÖF)", full: "Halkla İlişkiler ve Reklamcılık", color: "#a855f7", slug: "aof" },
};

const STATUS_META: Record<AcademicStatus, { label: string; color: string }> = {
  passed: { label: "GEÇTİ", color: "var(--success)" },
  exempt: { label: "MUAF", color: "var(--info)" },
  failed: { label: "KALDI", color: "var(--danger)" },
  in_progress: { label: "DEVAM", color: "var(--warning)" },
  not_taken: { label: "ALINMADI", color: "var(--text-muted)" },
};

const VERDICT_META: Record<TriageVerdict, { label: string; color: string }> = {
  take: { label: "GİR", color: "var(--success)" },
  hard: { label: "ZOR", color: "var(--warning)" },
  impossible: { label: "ERTELE", color: "var(--danger)" },
  project: { label: "TESLİM", color: "var(--fire)" },
  na: { label: "", color: "var(--text-muted)" },
};

const EXAM_PERIOD_LABEL: Record<string, string> = {
  ara_sinav: "Ara Sınav",
  final: "Final",
  butunleme: "Bütünleme",
  yaz_okulu: "Yaz Okulu",
  esertifika: "e-Sertifika Başvuru",
};

// ─────────────────────────────────────────────────────────────────────────────

export function AcademyShell({ beykentData, aofData, uiMode }: AcademyShellProps) {
  const [activeTab, setActiveTab] = useState<SubTab>("genel");

  const beykentCourses = useMemo(
    () => (beykentData?.courses ?? []).map(normalizeCourse),
    [beykentData]
  );
  const anadoluCourses = useMemo(
    () => (aofData?.courses ?? []).map(normalizeCourse),
    [aofData]
  );

  const allUpcoming = useMemo<TaggedExam[]>(() => {
    const beykentExams = beykentData?.exams ?? [];
    const anadoluExams = aofData?.exams ?? [];
    const tagged: (RawExamRow & { _uni: UniKey })[] = [
      ...beykentExams.map((e) => ({ ...e, _uni: "beykent" as const })),
      ...anadoluExams.map((e) => ({ ...e, _uni: "anadolu" as const })),
    ];
    return upcomingExams(tagged);
  }, [beykentData, aofData]);

  return (
    <div className="max-w-[960px] mx-auto px-4 sm:px-6 pb-20 select-none">
      {/* Title */}
      <div className="mb-6 pt-4">
        <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)] font-semibold block">
          AKADEMİK ADIM
        </span>
        <h1 className="text-xl font-display font-bold text-[var(--text-primary)] mt-1 flex items-center gap-2">
          <GraduationCap size={20} className="text-[var(--accent)]" /> Bugünkü Akademik Adım
        </h1>
      </div>

      {/* Sub-tabs */}
      <div className="flex border-b border-[var(--border-subtle)] gap-4 mb-6 overflow-x-auto">
        <TabButton icon={<Target size={14} />} label="GENEL" active={activeTab === "genel"} onClick={() => setActiveTab("genel")} />
        <TabButton icon={<Flag size={14} />} label="BEYKENT" active={activeTab === "beykent"} onClick={() => setActiveTab("beykent")} />
        <TabButton icon={<ListChecks size={14} />} label="ANADOLU" active={activeTab === "anadolu"} onClick={() => setActiveTab("anadolu")} />
        <TabButton icon={<CalendarClock size={14} />} label="TAKVİM" active={activeTab === "takvim"} onClick={() => setActiveTab("takvim")} />
      </div>

      {activeTab === "genel" && (
        <OverviewTab beykentCourses={beykentCourses} anadoluCourses={anadoluCourses} upcoming={allUpcoming} uiMode={uiMode} />
      )}
      {activeTab === "beykent" && <BeykentTab courses={beykentCourses} formula={FORMULAS.beykent} />}
      {activeTab === "anadolu" && <AnadoluTab courses={anadoluCourses} />}
      {activeTab === "takvim" && <CalendarTab upcoming={allUpcoming} />}

      <MigrationHint beykentCourses={beykentCourses} />
    </div>
  );
}

// ── Sub-tab button ──────────────────────────────────────────────────────────────
function TabButton({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 pb-3 px-1 text-xs font-mono font-bold uppercase tracking-wider transition-colors border-b-2 cursor-pointer whitespace-nowrap",
        active ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
      )}
    >
      {icon} {label}
    </button>
  );
}

// ── GENEL ────────────────────────────────────────────────────────────────────
function OverviewTab({
  beykentCourses,
  anadoluCourses,
  upcoming,
  uiMode,
}: {
  beykentCourses: NormalizedCourse[];
  anadoluCourses: NormalizedCourse[];
  upcoming: TaggedExam[];
  uiMode: 'koruma' | 'denge' | 'atak';
}) {
  const [showAllPriorities, setShowAllPriorities] = useState(false);

  const gamePlan = useMemo(() => {
    const items: { text: string; color: string }[] = [];
    for (const c of beykentCourses) {
      const t = triageCourse(c, FORMULAS.beykent);
      if (t.verdict === "take") items.push({ text: `Beykent finaline gir: ${c.name} (≥${t.requiredFinal})`, color: "var(--success)" });
      else if (t.verdict === "hard") items.push({ text: `Beykent finaline gir (zor, bütünleme de hesapta): ${c.name} (≥${t.requiredFinal})`, color: "var(--warning)" });
    }
    const anadoluFailed = anadoluCourses.filter((c) => c.status === "failed" && c.subsection !== "e-sertifika").length;
    if (anadoluFailed > 0) items.push({ text: `AÖF bütünlemeye gir: ${anadoluFailed} FF ders (final %70!)`, color: "#a855f7" });
    return items;
  }, [beykentCourses, anadoluCourses]);

  const academicLock = useMemo(() => {
    return getAcademicLock(upcoming, beykentCourses, anadoluCourses);
  }, [upcoming, beykentCourses, anadoluCourses]);

  const visiblePriorities = showAllPriorities ? gamePlan : gamePlan.slice(0, 3);

  const beykentSummary = useMemo(() => buildSummary(beykentCourses), [beykentCourses]);
  const anadoluSummary = useMemo(() => buildSummary(anadoluCourses), [anadoluCourses]);
  const beykentProgress = beykentSummary.total > 0 ? Math.round(((beykentSummary.passed + beykentSummary.exempt) / beykentSummary.total) * 100) : 0;
  const anadoluProgress = anadoluSummary.total > 0 ? Math.round(((anadoluSummary.passed + anadoluSummary.exempt) / anadoluSummary.total) * 100) : 0;

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      {/* Bugünün Akademik Kilidi Kartı */}
      <div className="bg-[var(--accent)]/5 border border-[var(--accent)]/30 rounded-card p-5 relative overflow-hidden shadow-soft">
        <div className="absolute top-0 right-0 w-24 h-24 bg-[var(--accent)]/5 rounded-full blur-2xl pointer-events-none" />
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] font-mono font-bold text-[var(--accent)] uppercase tracking-widest bg-[var(--accent)]/10 px-2 py-0.5 rounded-pill">
            BUGÜNÜN AKADEMİK ADIMI
          </span>
        </div>
        <h3 className="text-base font-display font-bold text-[var(--text-primary)] mb-1.5 flex items-center gap-2">
          🎓 {academicLock.courseName}
        </h3>
        <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed mb-3">
          {academicLock.reason}
        </p>
        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-[var(--accent)]/10">
          <div>
            <span className="text-[9px] font-mono uppercase tracking-widest text-[var(--text-muted)] font-bold block">
              25 DK MİNİMUM VERSİYON
            </span>
            <span className="text-[11px] text-[var(--text-primary)] font-medium mt-0.5 block">
              {academicLock.minWork}
            </span>
          </div>
          <div>
            <span className="text-[9px] font-mono uppercase tracking-widest text-[var(--text-muted)] font-bold block">
              YAKLAŞAN TARİH
            </span>
            <span className="text-[11px] text-[var(--accent)] font-mono mt-0.5 block">
              {academicLock.dateStr}
            </span>
          </div>
        </div>

        {/* UI Mode Specific Notices */}
        {uiMode === "koruma" && (
          <div className="mt-4 p-3 bg-cat-pink/12 border-l-2 border-cat-pink/50 border border-cat-pink/20 rounded-card text-xs text-cat-pink font-mono leading-relaxed">
            🛡️ Koruma modu devrede. Bugün sadece 25 dakikalık minimum aksiyonu tamamla ve kendini yorma.
          </div>
        )}
        {uiMode === "atak" && (
          <div className="mt-4 p-3 bg-cat-teal/12 border-l-2 border-cat-teal/50 border border-cat-teal/20 rounded-card text-xs text-cat-teal font-mono leading-relaxed">
            ⚡ Atak modu aktif! Hedefin üzerinde ekstra 45 dakikalık derin çalışma bloğu açabilir ve vites artırabilirsin.
          </div>
        )}
      </div>

      {/* Mini durum cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-[var(--bg-surface)] border border-cat-blue/20 border-l-2 border-l-cat-blue rounded-card p-3 flex items-center justify-between shadow-soft">
          <div>
            <span className="text-[9px] font-mono text-cat-blue uppercase tracking-wider block">BEYKENT DURUM</span>
            <span className="text-xs font-display font-bold text-[var(--text-primary)] mt-0.5 block">{beykentSummary.passed + beykentSummary.exempt}/{beykentSummary.total} Ders (%{beykentProgress})</span>
          </div>
          <span className="text-[10px] font-mono text-[var(--text-muted)]">{beykentSummary.remaining} kalan</span>
        </div>
        <div className="bg-[var(--bg-surface)] border border-cat-purple/20 border-l-2 border-l-cat-purple rounded-card p-3 flex items-center justify-between shadow-soft">
          <div>
            <span className="text-[9px] font-mono text-cat-purple uppercase tracking-wider block">ANADOLU AÖF DURUM</span>
            <span className="text-xs font-display font-bold text-[var(--text-primary)] mt-0.5 block">{anadoluSummary.passed + anadoluSummary.exempt}/{anadoluSummary.total} Ders (%{anadoluProgress})</span>
          </div>
          <span className="text-[10px] font-mono text-[var(--text-muted)]">{anadoluSummary.remaining} kalan</span>
        </div>
      </div>

      {/* Secondary items hidden behind a collapsible details section */}
      <details className="group border border-[var(--border-subtle)] rounded-card overflow-hidden bg-[var(--bg-base)]/30 shadow-soft">
        <summary className="w-full flex items-center justify-between p-4 text-left font-mono text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer select-none">
          <span>Öncelik Listesi &amp; Yaklaşan Sınavlar</span>
          <span className="text-[var(--text-tertiary)] font-mono text-sm group-open:hidden">+</span>
          <span className="text-[var(--text-tertiary)] font-mono text-sm hidden group-open:inline">−</span>
        </summary>
        <div className="p-4 space-y-6 border-t border-[var(--border-subtle)]/30">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-card p-4">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-[var(--border-subtle)]">
              <Target size={12} className="text-[var(--accent)]" />
              <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-[var(--accent)]">Öncelik Listesi</span>
            </div>
            {gamePlan.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] italic">Aktif aksiyon yok. Takvimi kontrol et.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {visiblePriorities.map((g, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: g.color }} />
                    <span className="text-xs text-[var(--text-secondary)]">{g.text}</span>
                  </div>
                ))}
                {gamePlan.length > 3 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setShowAllPriorities(!showAllPriorities);
                    }}
                    className="text-[9px] font-mono font-bold text-[var(--accent)] hover:underline mt-1 cursor-pointer block uppercase tracking-wider text-left border-none bg-transparent p-0"
                  >
                    {showAllPriorities ? "Daha Az Göster ▲" : `Diğer ${gamePlan.length - 3} Önceliği Göster ▼`}
                  </button>
                )}
              </div>
            )}
          </div>

          <UpcomingList upcoming={upcoming.slice(0, 4)} title="Yaklaşan Sınavlar" />
        </div>
      </details>
    </div>
  );
}

function Stat({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <div className="bg-[var(--bg-base)] rounded-card py-2 border border-[var(--border-subtle)] shadow-soft">
      <div className="text-lg font-bold font-mono" style={{ color }}>{n}</div>
      <div className="text-[9px] font-mono tracking-widest text-[var(--text-muted)] uppercase mt-0.5">{label}</div>
    </div>
  );
}

// ── BEYKENT yol haritası ────────────────────────────────────────────────────
function BeykentTab({ courses, formula }: { courses: NormalizedCourse[]; formula: PassingFormula }) {
  const inProgress = courses.filter((c) => c.status === "in_progress");
  const activeCourses = inProgress.filter((c) => !c.notes?.includes("bırakıldı"));
  const deferredCourses = inProgress.filter((c) => c.notes?.includes("bırakıldı"));
  const order: Record<TriageVerdict, number> = { take: 0, project: 1, hard: 2, impossible: 3, na: 4 };
  const triaged = activeCourses
    .map((c) => ({ course: c, t: triageCourse(c, formula) }))
    .sort((a, b) => order[a.t.verdict] - order[b.t.verdict]);
  const passed = courses.filter((c) => c.status === "passed");

  return (
    <div className="flex flex-col gap-5 animate-in fade-in duration-300">
      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-card p-4">
        <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
          <span className="text-[var(--info)] font-bold">Mezuniyet yol haritası.</span> Bu dönem aktif {activeCourses.length} ders.
          Geçme formülü: <span className="font-mono">%40 vize + %60 final</span>. Vize 0 (GR) olan teori derslerinde
          sadece finalle geçmek matematiksel olarak imkansız; stüdyo/proje dersleri final teslimiyle kurtarılır.
          <span className="text-[var(--text-muted)] block mt-1">⚠️ Final barajı varsa hedefi ona göre ayarla — yönetmelikten teyit et.</span>
        </p>
      </div>

      {triaged.map(({ course, t }) => (
        <CourseRoadmapRow key={course.id} course={course} verdict={t.verdict} message={t.message} />
      ))}

      {passed.length > 0 && (
        <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-card p-4">
          <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)] font-semibold">Tamamlanan ({passed.length})</span>
          <div className="flex flex-wrap gap-2 mt-2">
            {passed.map((c) => (
              <span key={c.id} className="text-[11px] text-cat-teal bg-cat-teal/10 px-2 py-1 rounded-pill flex items-center gap-1">
                <CheckCircle2 size={11} /> {c.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {deferredCourses.length > 0 && (
        <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-card p-4 opacity-50">
          <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)] font-semibold flex items-center gap-1.5">
            <CircleDashed size={11} /> Ertelendi — 2026-2027 Güz ({deferredCourses.length})
          </span>
          <div className="flex flex-wrap gap-2 mt-2">
            {deferredCourses.map((c) => (
              <span key={c.id} className="text-[11px] text-[var(--text-muted)] bg-[var(--text-muted)]/10 px-2 py-1 rounded-pill">
                {c.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CourseRoadmapRow({ course, verdict, message }: { course: NormalizedCourse; verdict: TriageVerdict; message: string }) {
  const vm = VERDICT_META[verdict];
  return (
    <div className="bg-[var(--bg-surface)] border rounded-card p-4" style={{ borderColor: `${vm.color}22` }}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <div className="text-sm font-display font-semibold text-[var(--text-primary)]">{course.name}</div>
          <div className="text-[11px] text-[var(--text-muted)] font-mono mt-0.5">
            {course.code ?? "—"} · vize: {course.vizeMissed ? "GR" : course.vize ?? "—"}
          </div>
        </div>
        <span className="text-[10px] font-mono font-bold px-2 py-1 rounded-pill shrink-0" style={{ color: vm.color, backgroundColor: `${vm.color}15` }}>
          {vm.label}
        </span>
      </div>
      <p className="text-[12px] text-[var(--text-secondary)] leading-snug">{message}</p>
      {course.notes && <p className="text-[11px] text-[var(--warning)]/80 italic mt-1.5">{course.notes}</p>}
    </div>
  );
}

// ── ANADOLU ──────────────────────────────────────────────────────────────────
// ── ANADOLU ──────────────────────────────────────────────────────────────────
function AnadoluTab({ courses }: { courses: NormalizedCourse[] }) {
  const [isOpenFailed, setIsOpenFailed] = useState(false);
  const [showAllFailed, setShowAllFailed] = useState(false);
  const mainCourses = courses.filter((c) => c.subsection !== "e-sertifika");
  const failed = mainCourses.filter((c) => c.status === "failed").sort((a, b) => (a.semester ?? 0) - (b.semester ?? 0));
  const s = buildSummary(mainCourses);

  const visibleFailed = showAllFailed ? failed : failed.slice(0, 3);
  const recommendedFocus = failed[0];

  return (
    <div className="flex flex-col gap-5 animate-in fade-in duration-300">
      <div className="bg-[var(--bg-surface)] border rounded-card p-4" style={{ borderColor: "#a855f725" }}>
        <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
          <span className="text-[#a855f7] font-bold">AÖF mantığı:</span> devamsızlık/kayıp yok, dersler kaybolmaz.
          Vizeleri verdin ama dönem sonlarına girmedin → hepsi FF. Tek yapman gereken{" "}
          <span className="text-[var(--text-primary)] font-semibold">sınava girmek</span>. Final ağırlığı{" "}
          <span className="font-mono">%70</span> — finali asla kaçırma.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <Stat n={s.passed} label="GEÇTİ" color="var(--success)" />
        <Stat n={s.exempt} label="MUAF" color="var(--info)" />
        <Stat n={s.failed} label="FF" color="var(--danger)" />
        <Stat n={s.notTaken} label="KALAN" color="var(--text-muted)" />
      </div>

      {recommendedFocus && (
        <div className="bg-cat-purple/5 border border-cat-purple/30 border-l-2 border-l-cat-purple rounded-card p-4 relative overflow-hidden shadow-soft animate-in fade-in duration-300">
          <div className="absolute top-0 right-0 text-[8px] font-mono bg-cat-purple/20 text-cat-purple px-2 py-0.5 rounded-bl font-bold uppercase tracking-wider">TEK BÜTÜNLEME ODAĞI</div>
          <span className="text-[9px] font-mono uppercase tracking-widest text-cat-purple font-bold block mb-1">
            Önerilen Aksiyon Hedefi
          </span>
          <h4 className="text-[14px] font-display font-bold text-[var(--text-primary)] mb-1">
            🎯 {recommendedFocus.name}
          </h4>
          <p className="text-[11px] text-[var(--text-secondary)]">
            AÖF bütünlemede en yüksek geçme potansiyeline sahip ilk FF dersin. 25 dakikalık okumayla başla!
          </p>
        </div>
      )}

      <div className="bg-[var(--bg-surface)] border border-cat-pink/15 rounded-card overflow-hidden shadow-soft">
        <button
          onClick={() => setIsOpenFailed(!isOpenFailed)}
          className="w-full flex items-center justify-between p-4 text-left hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer"
        >
          <span className="text-xs font-mono font-bold uppercase tracking-widest text-cat-pink flex items-center gap-2">
            <AlertTriangle size={13} className="text-cat-pink" /> Tekrar Alınacak FF Dersler ({failed.length})
          </span>
          <span className="text-[var(--text-muted)] font-mono text-[10px]">{isOpenFailed ? "GİZLE ▲" : "LİSTELE ▼"}</span>
        </button>

        {isOpenFailed && (
          <div className="p-4 pt-0 border-t border-cat-pink/5 bg-[var(--bg-base)]/40">
            <div className="flex flex-col gap-2 mt-3">
              {visibleFailed.map((c) => (
                <div key={c.id} className="bg-[var(--bg-surface)] border border-cat-pink/10 rounded-card px-4 py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[13px] text-[var(--text-primary)] truncate">{c.name}</div>
                    <div className="text-[10px] text-[var(--text-muted)] font-mono">
                      {c.code} · {c.semester ? `${c.semester}. yarıyıl` : "—"} · vize: {c.vize ?? "—"}
                    </div>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-cat-pink bg-cat-pink/10 px-2 py-0.5 rounded-pill shrink-0">FF</span>
                </div>
              ))}
              {failed.length > 3 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowAllFailed(!showAllFailed);
                  }}
                  className="w-full mt-2 py-2 text-center text-xs font-mono font-bold text-cat-purple bg-cat-purple/5 border border-cat-purple/15 rounded-card hover:bg-cat-purple/10 transition-colors cursor-pointer"
                >
                  {showAllFailed ? "Derslerin Devamını Gizle ▲" : `Derslerin Devamını Göster (${failed.length - 3} ders saklı) ▼`}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <ESertifikaSection courses={courses} />

      <CurriculumBySemester courses={courses} />
    </div>
  );
}

function ESertifikaSection({ courses }: { courses: NormalizedCourse[] }) {
  const esert = courses.filter((c) => c.subsection === "e-sertifika");
  const [showAllESert, setShowAllESert] = useState(false);

  if (esert.length === 0) return null;

  const recommended = esert[0];
  const others = esert.slice(1);

  return (
    <div>
      <span className="text-[10px] font-mono uppercase tracking-widest text-cat-purple font-semibold flex items-center gap-1.5 mb-2">
        <Award size={12} /> e-Sertifika Programları ({esert.length})
      </span>
      <div className="flex flex-col gap-2">
        <div className="bg-[var(--bg-surface)] border rounded-card p-4 border-cat-purple/30 border-l-2 border-l-cat-purple shadow-soft relative overflow-hidden">
          <div className="absolute top-0 right-0 text-[8px] font-mono bg-cat-purple/20 text-cat-purple px-1.5 py-0.5 rounded-bl tracking-wider font-bold">ÖNERİLEN</div>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[13px] text-[var(--text-primary)] truncate font-medium">{recommended.name}</div>
              <div className="text-[10px] text-[var(--text-muted)] font-mono">{recommended.code}</div>
            </div>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-pill bg-cat-purple/10 text-cat-purple">
              BAŞVURULMADI
            </span>
          </div>
          {recommended.notes && <p className="text-[11px] mt-1.5 text-cat-purple/80">{recommended.notes}</p>}
        </div>

        {others.length > 0 && (
          <>
            {showAllESert ? (
              <div className="space-y-2 mt-1 animate-in fade-in duration-200">
                {others.map((c) => {
                  const done = c.status === "passed";
                  const active = c.status === "in_progress";
                  const color = done ? "var(--success)" : active ? "var(--warning)" : "#a855f7";
                  const label = done ? "TAMAMLANDI" : active ? "KAYITLI" : "BAŞVURULMADI";
                  return (
                    <div key={c.id} className="bg-[var(--bg-surface)] border rounded-card px-4 py-2.5" style={{ borderColor: `${color}22` }}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[13px] text-[var(--text-primary)] truncate">{c.name}</div>
                          <div className="text-[10px] text-[var(--text-muted)] font-mono">{c.code}</div>
                        </div>
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-pill shrink-0" style={{ color, backgroundColor: `${color}15` }}>
                          {label}
                        </span>
                      </div>
                      {c.notes && <p className="text-[11px] mt-1.5" style={{ color: `${color}99` }}>{c.notes}</p>}
                    </div>
                  );
                })}
                <button
                  onClick={() => setShowAllESert(false)}
                  className="w-full py-2 text-center text-xs font-mono font-bold text-cat-purple bg-cat-purple/5 border border-cat-purple/15 rounded-card hover:bg-cat-purple/10 transition-colors cursor-pointer"
                >
                  Diğer Sertifikaları Gizle ▲
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAllESert(true)}
                className="w-full py-2 text-center text-xs font-mono font-bold text-cat-purple bg-cat-purple/5 border border-cat-purple/15 rounded-card hover:bg-cat-purple/10 transition-colors cursor-pointer"
              >
                Diğer Sertifikaları Göster ({others.length} program gizli) ▼
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CurriculumBySemester({ courses }: { courses: NormalizedCourse[] }) {
  const [isOpenCurriculum, setIsOpenCurriculum] = useState(false);
  const bySem = useMemo(() => {
    const map = new Map<number, NormalizedCourse[]>();
    for (const c of courses) {
      if (c.semester == null) continue;
      const arr = map.get(c.semester) ?? [];
      arr.push(c);
      map.set(c.semester, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [courses]);

  if (bySem.length === 0) return null;

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-card overflow-hidden">
      <button
        onClick={() => setIsOpenCurriculum(!isOpenCurriculum)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer"
      >
        <span className="text-xs font-mono font-bold uppercase tracking-widest text-[var(--text-muted)] flex items-center gap-2">
          Müfredat ve Dönem Başarısı
        </span>
        <span className="text-[var(--text-muted)] font-mono text-[10px]">{isOpenCurriculum ? "GİZLE ▲" : "MÜFREDATI GÖSTER ▼"}</span>
      </button>

      {isOpenCurriculum && (
        <div className="p-4 pt-0 border-t border-[var(--border-subtle)]/5 bg-[var(--bg-base)]/40">
          <div className="flex flex-col gap-2 mt-3">
            {bySem.map(([sem, list]) => {
              const done = list.filter((c) => c.status === "passed" || c.status === "exempt").length;
              return (
                <div key={sem} className="bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-card px-4 py-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-mono text-[var(--text-secondary)]">{sem}. Yarıyıl</span>
                    <span className="text-[10px] font-mono text-[var(--text-muted)]">{done}/{list.length}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {list.map((c) => {
                      const sm = STATUS_META[c.status];
                      return (
                        <span
                          key={c.id}
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded-pill flex items-center gap-1"
                          style={{ color: sm.color, backgroundColor: `${sm.color}12` }}
                          title={`${c.name} — ${sm.label}`}
                        >
                          {c.status === "not_taken" ? <CircleDashed size={9} /> : null}
                          {c.code ?? c.name}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── TAKVİM ────────────────────────────────────────────────────────────────────
function CalendarTab({ upcoming }: { upcoming: TaggedExam[] }) {
  return <UpcomingList upcoming={upcoming} title="Tüm Yaklaşan Sınav & Teslimler" full />;
}

function UpcomingList({ upcoming, title, full }: { upcoming: TaggedExam[]; title: string; full?: boolean }) {
  if (upcoming.length === 0) {
    return (
      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-card p-6 text-center">
        <span className="text-xs text-[var(--text-muted)] italic">Yaklaşan sınav yok — takvim güncel değilse Playwright scraper&apos;ı çalıştır.</span>
      </div>
    );
  }
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-card p-5 shadow-soft">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[var(--border-subtle)]">
        <CalendarClock size={14} className="text-[var(--accent)]" />
        <span className="text-xs font-mono font-bold uppercase tracking-widest text-[var(--accent)]">{title}</span>
      </div>
      <div className="flex flex-col gap-2.5">
        {upcoming.map((e) => {
          const uniColor = UNI_META[e._uni].color;
          const urgent = e.daysLeft <= 7;
          const period = e.exam_period ?? "";
          return (
            <div
              key={e.id}
              className="flex items-center justify-between gap-3 px-4 py-3 rounded-card bg-[var(--bg-base)] border"
              style={{ borderColor: urgent ? "#F472B644" : "var(--border-subtle)" }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-1.5 h-8 rounded-full shrink-0" style={{ backgroundColor: uniColor }} />
                <div className="min-w-0">
                  <div className="text-[13px] text-[var(--text-primary)] truncate flex items-center gap-2">
                    {e.courses?.name || e.title}
                    {e.confirmed === false && (
                      <span className="text-[8px] font-mono font-bold text-cat-orange bg-cat-orange/10 px-1 py-0.5 rounded-pill tracking-wider">TAHMİNİ</span>
                    )}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] font-mono mt-0.5">
                    {EXAM_PERIOD_LABEL[period] ?? e.title} · {new Date(e.exam_date).toLocaleDateString("tr-TR", { day: "numeric", month: "long" })}
                    {full ? ` · ${UNI_META[e._uni].label}` : ""}
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xl font-bold font-mono leading-none" style={{ color: urgent ? "var(--cat-pink)" : e.daysLeft <= 14 ? "var(--cat-orange)" : "var(--text-primary)" }}>
                  {e.daysLeft}
                </div>
                <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--text-muted)] mt-0.5">gün</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Migration uyarısı ──────────────────────────────────────────────────────────
function MigrationHint({ beykentCourses }: { beykentCourses: NormalizedCourse[] }) {
  const hasNewSchema = beykentCourses.some((c) => c.code !== null);
  if (hasNewSchema) return null;
  return (
    <div className="mt-6 bg-[var(--warning)]/5 border-l-2 border-cat-orange/50 border border-[var(--warning)]/20 rounded-card px-4 py-3 shadow-soft">
      <span className="text-[11px] text-[var(--warning)] leading-relaxed block">
        ⚠️ Zengin veriler için <span className="font-mono">supabase/migrations/20260531_academy_upgrade.sql</span> dosyasını
        Supabase&apos;de uygula. Uygulanana kadar tab eski (sınırlı) veriyle çalışır.
      </span>
    </div>
  );
}
