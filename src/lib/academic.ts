// ─────────────────────────────────────────────────────────────────────────────
// AKADEMİ — saf hesap katmanı
//
// getUniversityData (src/app/actions/university.ts) Supabase'den ham satır döner.
// Bu modül o ham satırları normalize eder, geçme matematiğini ve özetleri üretir.
// Migration (20260531_academy_upgrade.sql) uygulanmadıysa yeni kolonlar undefined
// gelir; normalizer eski kolonlardan (status, letter, midterm_score) türetir.
// ─────────────────────────────────────────────────────────────────────────────

export type AcademicStatus =
  | "passed"
  | "failed"
  | "in_progress"
  | "exempt"
  | "not_taken";

export type GradeType = "exam" | "project" | "staj";

/** Supabase courses satırı (gevşek — migration öncesi alanlar eksik olabilir). */
export interface RawCourseRow {
  id: string;
  name: string;
  instructor?: string | null;
  status?: string | null; // legacy: critical|on_track|safe
  midterm_score?: number | null;
  notes?: string | null;
  subsection?: string | null;
  code?: string | null;
  akts?: number | null;
  semester?: number | null;
  grade_type?: string | null;
  academic_status?: string | null;
  letter?: string | null;
  vize_score?: number | null;
  final_score?: number | null;
}

/** Supabase exams satırı. */
export interface RawExamRow {
  id: string;
  title: string;
  exam_date: string;
  type?: string | null;
  exam_period?: string | null;
  is_completed?: boolean | null;
  confirmed?: boolean | null;
  exam_time?: string | null;
  courses?: { name: string } | null;
}

export interface NormalizedCourse {
  id: string;
  code: string | null;
  name: string;
  instructor: string | null;
  status: AcademicStatus;
  gradeType: GradeType;
  letter: string | null;
  semester: number | null;
  akts: number | null;
  /** Vize notu (sayı) ya da null. */
  vize: number | null;
  /** in_progress + vize yok → GR (girmedi). */
  vizeMissed: boolean;
  final: number | null;
  notes: string | null;
  subsection: string | null;
}

export interface PassingFormula {
  vizeWeight: number;
  finalWeight: number;
  passThreshold: number;
}

export const FORMULAS: Record<string, PassingFormula> = {
  beykent: { vizeWeight: 0.4, finalWeight: 0.6, passThreshold: 50 },
  aof: { vizeWeight: 0.3, finalWeight: 0.7, passThreshold: 50 },
};

const PASSING_LETTERS = new Set(["AA", "BA", "BB", "CB", "CC", "DC", "DD", "G", "MU"]);

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "string" ? parseFloat(value) : (value as number);
  return Number.isFinite(n) ? n : null;
}

function deriveStatus(raw: RawCourseRow): AcademicStatus {
  const explicit = raw.academic_status;
  if (
    explicit === "passed" ||
    explicit === "failed" ||
    explicit === "in_progress" ||
    explicit === "exempt" ||
    explicit === "not_taken"
  ) {
    return explicit;
  }
  // Migration öncesi: harf notundan / legacy status'tan türet.
  const letter = raw.letter?.toUpperCase();
  if (letter === "MU") return "exempt";
  if (letter === "FF" || letter === "FD") return "failed";
  if (letter && PASSING_LETTERS.has(letter)) return "passed";
  return "in_progress";
}

function deriveGradeType(raw: RawCourseRow): GradeType {
  if (raw.grade_type === "project" || raw.grade_type === "staj" || raw.grade_type === "exam") {
    return raw.grade_type;
  }
  return "exam";
}

export function normalizeCourse(raw: RawCourseRow): NormalizedCourse {
  const status = deriveStatus(raw);
  const vize = toNumber(raw.vize_score) ?? toNumber(raw.midterm_score);
  return {
    id: raw.id,
    code: raw.code ?? null,
    name: raw.name,
    instructor: raw.instructor ?? null,
    status,
    gradeType: deriveGradeType(raw),
    letter: raw.letter ?? null,
    semester: raw.semester ?? null,
    akts: raw.akts ?? null,
    vize,
    vizeMissed: status === "in_progress" && vize === null,
    final: toNumber(raw.final_score),
    notes: raw.notes ?? null,
    subsection: raw.subsection ?? null,
  };
}

// ── Özet ──────────────────────────────────────────────────────────────────────

export interface AcademicSummary {
  total: number;
  passed: number;
  failed: number;
  inProgress: number;
  exempt: number;
  notTaken: number;
  /** passed+exempt akts toplamı. */
  earnedAkts: number;
  /** tüm derslerin akts toplamı (bilinen). */
  totalAkts: number;
  /** Mezuniyete kalan ders (failed + in_progress + not_taken). */
  remaining: number;
}

export function buildSummary(courses: NormalizedCourse[]): AcademicSummary {
  const acc: AcademicSummary = {
    total: courses.length,
    passed: 0,
    failed: 0,
    inProgress: 0,
    exempt: 0,
    notTaken: 0,
    earnedAkts: 0,
    totalAkts: 0,
    remaining: 0,
  };
  for (const c of courses) {
    acc.totalAkts += c.akts ?? 0;
    switch (c.status) {
      case "passed":
        acc.passed += 1;
        acc.earnedAkts += c.akts ?? 0;
        break;
      case "exempt":
        acc.exempt += 1;
        acc.earnedAkts += c.akts ?? 0;
        break;
      case "failed":
        acc.failed += 1;
        acc.remaining += 1;
        break;
      case "in_progress":
        acc.inProgress += 1;
        acc.remaining += 1;
        break;
      case "not_taken":
        acc.notTaken += 1;
        acc.remaining += 1;
        break;
    }
  }
  return acc;
}

// ── Geçme matematiği / triage ──────────────────────────────────────────────────

export type TriageVerdict = "take" | "hard" | "impossible" | "project" | "na";

export interface Triage {
  verdict: TriageVerdict;
  /** Geçmek için finalden gereken minimum not (exam dersleri için). */
  requiredFinal: number | null;
  message: string;
}

/** Geçmek için finalden gereken net: (baraj − vizeAğırlık·vize) / finalAğırlık. */
export function requiredFinal(vize: number, formula: PassingFormula): number {
  const need = (formula.passThreshold - formula.vizeWeight * vize) / formula.finalWeight;
  return Math.max(0, Math.round(need * 10) / 10);
}

export function triageCourse(course: NormalizedCourse, formula: PassingFormula): Triage {
  if (course.status !== "in_progress") {
    return { verdict: "na", requiredFinal: null, message: "" };
  }
  if (course.gradeType === "project" || course.gradeType === "staj") {
    return {
      verdict: "project",
      requiredFinal: null,
      message: "Proje/teslim dersi — notu sınav değil teslim belirler. Final teslimiyle geçilebilir.",
    };
  }
  const vize = course.vize ?? 0;
  const need = requiredFinal(vize, formula);
  if (need <= 80) {
    return {
      verdict: "take",
      requiredFinal: need,
      message: `Finale GİR — geçmek için finalden ≥ ${need} yeter. Ulaşılabilir.`,
    };
  }
  if (need <= 100) {
    return {
      verdict: "hard",
      requiredFinal: need,
      message: `Zor ama mümkün — finalden ≥ ${need} gerek. Bütünlemeyi de hesaba kat.`,
    };
  }
  return {
    verdict: "impossible",
    requiredFinal: need,
    message: `Sadece finalle geçilmez (gereken ≥ ${need} > 100). Gelecek döneme bırakmak savunulabilir.`,
  };
}

// ── Sınav takvimi ──────────────────────────────────────────────────────────────

export interface UpcomingExam extends RawExamRow {
  daysLeft: number;
}

export function daysUntil(dateStr: string, now: Date = new Date()): number {
  const targetDateOnly = dateStr.split("T")[0];
  const targetTime = new Date(`${targetDateOnly}T00:00:00.000Z`).getTime();

  // YYYY-MM-DD formatting based on Europe/Istanbul timezone for today
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = formatter.formatToParts(now);
  let year = "", month = "", day = "";
  for (const part of parts) {
    if (part.type === 'year') year = part.value;
    if (part.type === 'month') month = part.value;
    if (part.type === 'day') day = part.value;
  }
  const nowStr = `${year}-${month}-${day}`;
  const nowTime = new Date(`${nowStr}T00:00:00.000Z`).getTime();

  const diffMs = targetTime - nowTime;
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export function upcomingExams<T extends RawExamRow>(
  exams: T[],
  now: Date = new Date()
): (T & { daysLeft: number })[] {
  return exams
    .filter((e) => !e.is_completed && daysUntil(e.exam_date, now) >= 0)
    .map((e) => ({ ...e, daysLeft: daysUntil(e.exam_date, now) }))
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

export interface AcademicLock {
  courseName: string;
  reason: string;
  minWork: string;
  dateStr: string;
}

export type AcademicIntent = "beykent" | "aof" | "esertifika" | "general";

export function getAcademicLock(
  upcoming: Array<RawExamRow & { daysLeft: number; _uni?: string }>,
  beykentCourses: NormalizedCourse[],
  anadoluCourses: NormalizedCourse[],
  intent: AcademicIntent = "general"
): AcademicLock {
  // Combine all active course names for name-based matching
  const activeCourses = [
    ...beykentCourses.filter(c => c.status === "in_progress" && !c.notes?.includes("bırakıldı")),
    ...anadoluCourses.filter(c => c.status === "failed" && c.subsection !== "e-sertifika"),
    ...anadoluCourses.filter(c => c.subsection === "e-sertifika" && c.status !== "passed")
  ];

  const activeCourseNames = activeCourses.map(c => c.name.toLowerCase());

  // Helper to determine if an exam is a specific course-bound exam (not a generic calendar event)
  const isCourseBound = (e: RawExamRow) => {
    const titleLower = e.title.toLowerCase();
    const genericKeywords = ["başlangıcı", "son günü", "son gün", "kayıt", "başvurusu", "başvuru", "generic"];
    if (genericKeywords.some(kw => titleLower.includes(kw))) {
      return false;
    }
    // Has a database link
    if (e.courses && e.courses.name) {
      return true;
    }
    // Title contains any active course name
    return activeCourseNames.some(name => titleLower.includes(name));
  };

  // ── 1. INTENT AWARE CASCADES ───────────────────────────────────────────────
  
  if (intent === "beykent") {
    const activeBeykent = beykentCourses.filter(c => c.status === "in_progress" && !c.notes?.includes("bırakıldı"));
    const lockCourse = activeBeykent.length > 0 ? activeBeykent[0] : null;

    if (lockCourse) {
      const matchResult = getMatchedExamForLock(lockCourse.name, upcoming, "beykent");
      const nextExam = matchResult.exam;

      if (nextExam) {
        const isTahmini = nextExam.confirmed === false;
        const matchedCourse = nextExam.courses?.name || lockCourse.name;

        return {
          courseName: matchedCourse,
          reason: `Beykent final sınavına sadece ${nextExam.daysLeft} gün kaldı! Kritik akademik öncelik.`,
          minWork: "25 dakikalık tek odaklı okuma ve ders özeti çıkarma.",
          dateStr: new Date(nextExam.exam_date).toLocaleDateString("tr-TR", { day: "numeric", month: "long" }) + (isTahmini ? " (TAHMİNİ)" : "")
        };
      }

      // Fallback
      return {
        courseName: lockCourse.name,
        reason: "Final sınavları yaklaşıyor, vize durumuna göre bu derse asılmamız kritik! Dönem içi stüdyo/proje teslimi devam ediyor. Sistemi bozma.",
        minWork: "25 dakika boyunca stüdyo taslağını veya ödevini çiz, düzenle.",
        dateStr: "Haziran 2026 (TAHMİNİ)"
      };
    }
  }

  if (intent === "aof") {
    const aofFailed = anadoluCourses.filter(c => c.status === "failed" && c.subsection !== "e-sertifika");
    const lockCourse = aofFailed.length > 0 ? aofFailed[0] : null;

    if (lockCourse) {
      // Use the helper to check alignment
      const matchResult = getMatchedExamForLock(lockCourse.name, upcoming, "aof");
      const nextExam = matchResult.exam;
      const hasDiscrepancy = matchResult.discrepancy;

      if (nextExam) {
        const isTahmini = nextExam.confirmed === false;
        if (hasDiscrepancy) {
          // Veri uyuşmazlığı varsa fallback şu şekilde dürüst olsun:
          // “Bütünleme sınav verisinde ders eşleşmesi tutarsız; bugün güvenli odak olarak şu FF dersi seçildi.”
          return {
            courseName: lockCourse.name,
            reason: `Bütünleme sınav verisinde ders eşleşmesi tutarsız; bugün güvenli odak olarak şu ${lockCourse.name} FF dersi seçildi.`,
            minWork: "25 dakika boyunca AÖF özet kitabından 1 ünite oku ve not çıkar.",
            dateStr: "Bütünleme takvimi Supabase'de kesin değil"
          };
        }

        // Consistent match: use nextExam!
        // Tek kaynak seç: öncelik course relation ise title yerine courses.name kullan; title kullanılacaksa lock.courseName de title’daki dersle aynı olsun.
        const matchedCourse = nextExam.courses?.name || lockCourse.name;
        return {
          courseName: matchedCourse,
          reason: `AÖF bütünleme sınavına sadece ${nextExam.daysLeft} gün kaldı! Kritik akademik öncelik.`,
          minWork: "25 dakikalık tek odaklı okuma ve ders özeti çıkarma.",
          dateStr: new Date(nextExam.exam_date).toLocaleDateString("tr-TR", { day: "numeric", month: "long" }) + (isTahmini ? " (TAHMİNİ)" : "")
        };
      }
    }

    // 2. Check AÖF failed courses fallback when no upcoming exam exists
    if (lockCourse) {
      const aofButunlemeExam = upcoming.find(e => e.exam_period === "butunleme");
      const aofDateStr = aofButunlemeExam 
        ? new Date(aofButunlemeExam.exam_date).toLocaleDateString("tr-TR", { day: "numeric", month: "long" }) + " (TAHMİNİ)"
        : "Bütünleme takvimi Supabase'de kesin değil";

      return {
        courseName: lockCourse.name,
        reason: "Bütünlemede temizlenmesi gereken FF ders. AÖF bütünleme sınavı yaklaşırken tempoyu koru!",
        minWork: "25 dakika boyunca AÖF özet kitabından 1 ünite oku ve not çıkar.",
        dateStr: aofDateStr
      };
    }
  }

  if (intent === "esertifika") {
    const activeESertifika = anadoluCourses.filter(c => c.subsection === "e-sertifika" && c.status !== "passed");
    if (activeESertifika.length > 0) {
      const first = activeESertifika[0];
      const matchResult = getMatchedExamForLock(first.name, upcoming, "esertifika");
      const esertExam = matchResult.exam;

      const esertDateStr = esertExam
        ? new Date(esertExam.exam_date).toLocaleDateString("tr-TR", { day: "numeric", month: "long" }) + " (TAHMİNİ)"
        : "e-Sertifika takvimi Supabase'de kesin değil";

      return {
        courseName: first.name,
        reason: esertExam
          ? `e-Sertifika programı kapsamında kritik süreç yaklaşıyor! Ritimle ilerle.`
          : "Akademik ana risk bulunmuyor. e-Sertifika programında mikro adımlarla ilerle!",
        minWork: "25 dakika boyunca ilgili sertifika içeriğini incele ve planı sadeleştir.",
        dateStr: esertDateStr
      };
    }
  }

  // ── 2. GLOBAL FALLBACK CASCADE (general) ───────────────────────────────────

  // 1. Check upcoming course-bound exams
  const nextExam = upcoming.find(e => e.daysLeft >= 0 && isCourseBound(e));
  if (nextExam) {
    const isTahmini = nextExam.confirmed === false;
    const matchedCourse = activeCourses.find(c => nextExam.title.toLowerCase().includes(c.name.toLowerCase()))?.name 
      || nextExam.courses?.name 
      || nextExam.title;

    const formattedDate = new Date(nextExam.exam_date).toLocaleDateString("tr-TR", { day: "numeric", month: "long" }) 
      + (isTahmini ? " (TAHMİNİ)" : "");

    return {
      courseName: matchedCourse,
      reason: `Sınavına sadece ${nextExam.daysLeft} gün kaldı! Kritik akademik öncelik.`,
      minWork: "25 dakikalık tek odaklı okuma ve ders özeti çıkarma.",
      dateStr: formattedDate
    };
  }

  // 2. Check active Beykent courses in progress (excluding deferred ones)
  const activeBeykent = beykentCourses.filter(c => c.status === "in_progress" && !c.notes?.includes("bırakıldı"));
  if (activeBeykent.length > 0) {
    const first = activeBeykent[0];
    return {
      courseName: first.name,
      reason: "Final sınavları yaklaşıyor, vize durumuna göre bu derse asılmamız kritik! Dönem içi stüdyo/proje teslimi devam ediyor. Sistemi bozma.",
      minWork: "25 dakika boyunca stüdyo taslağını veya ödevini çiz, düzenle.",
      dateStr: "Beykent final takvimi kesinleşmedi"
    };
  }

  // 3. Check AÖF failed courses (excluding e-sertifika)
  const aofFailed = anadoluCourses.filter(c => c.status === "failed" && c.subsection !== "e-sertifika");
  if (aofFailed.length > 0) {
    const first = aofFailed[0];
    const aofButunlemeExam = upcoming.find(e => e.exam_period === "butunleme");
    const aofDateStr = aofButunlemeExam 
      ? new Date(aofButunlemeExam.exam_date).toLocaleDateString("tr-TR", { day: "numeric", month: "long" }) + " (TAHMİNİ)"
      : "Bütünleme takvimi Supabase'de kesin değil";

    return {
      courseName: first.name,
      reason: "Bütünlemede temizlenmesi gereken FF ders. AÖF bütünleme sınavı yaklaşırken tempoyu koru!",
      minWork: "25 dakika boyunca AÖF özet kitabından 1 ünite oku ve not çıkar.",
      dateStr: aofDateStr
    };
  }

  // 4. Check e-Sertifika courses in progress or not taken
  const activeESertifika = anadoluCourses.filter(c => c.subsection === "e-sertifika" && c.status !== "passed");
  if (activeESertifika.length > 0) {
    const first = activeESertifika[0];
    const esertExam = upcoming.find(e => e.exam_period === "esertifika");
    const esertDateStr = esertExam
      ? new Date(esertExam.exam_date).toLocaleDateString("tr-TR", { day: "numeric", month: "long" }) + " (TAHMİNİ)"
      : "e-Sertifika takvimi Supabase'de kesin değil";

    return {
      courseName: first.name,
      reason: "Akademik ana risk bulunmuyor. e-Sertifika programında mikro adımlarla ilerle!",
      minWork: "25 dakika boyunca ilgili sertifika içeriğini incele ve planı sadeleştir.",
      dateStr: esertDateStr
    };
  }

  return {
    courseName: "Tüm Cepheler Sakin",
    reason: "Şu an yaklaşan aktif sınav veya teslim riski görünmüyor.",
    minWork: "Bugün akademik kilit yerine Gelişim Merdivenindeki 2026 becerilerine odaklanabilirsin.",
    dateStr: "—"
  };
}

/**
 * Checks if the title contains the lock course name, avoiding Roman numeral substring false positives
 * (e.g., "İngilizce I" shouldn't match "İngilizce II" or "İngilizce III")
 */
export function isSafeTitleMatch(titleLower: string, lockLower: string): boolean {
  const index = titleLower.indexOf(lockLower);
  if (index === -1) return false;

  // Verify next character is not a digit or a roman numeral character (i, v, x)
  const nextChar = titleLower[index + lockLower.length];
  if (nextChar && /^[ivx0-9]$/i.test(nextChar)) {
    return false;
  }
  return true;
}

/**
 * Align active lock courses with exams to check for title/relation discrepancies
 */
export function getMatchedExamForLock(
  lockCourseName: string,
  upcoming: Array<RawExamRow & { daysLeft: number }>,
  intent: string
): { exam: (RawExamRow & { daysLeft: number }) | null; discrepancy: boolean } {
  if (!lockCourseName || lockCourseName === "Tüm Cepheler Sakin") {
    return { exam: null, discrepancy: false };
  }

  const lockLower = lockCourseName.toLowerCase();
  
  // Filter upcoming exams matching the intent
  const relevantExams = upcoming.filter(e => {
    const titleLower = e.title.toLowerCase();
    if (intent === "aof") {
      return e.exam_period === "butunleme" || titleLower.includes("aöf") || titleLower.includes("aof") || titleLower.includes("bütünleme") || titleLower.includes("butunleme");
    }
    if (intent === "esertifika") {
      return e.exam_period === "esertifika" || titleLower.includes("sertifika");
    }
    if (intent === "beykent") {
      return titleLower.includes("beykent") || titleLower.includes("final") || isSafeTitleMatch(titleLower, lockLower);
    }
    return true;
  });

  // 1. Prioritize course relation match
  const courseLinkedMatch = relevantExams.find(e => e.courses?.name && e.courses.name.toLowerCase() === lockLower);
  if (courseLinkedMatch) {
    const titleLower = courseLinkedMatch.title.toLowerCase();
    const isGenericTitle = titleLower.includes("başlangıcı") || titleLower.includes("son günü") || titleLower.includes("takvim");
    if (!isGenericTitle && !isSafeTitleMatch(titleLower, lockLower)) {
      // Discrepancy (e.g. course-linked is Inglizce I but exam title is Inglizce II)
      return { exam: courseLinkedMatch, discrepancy: true };
    }
    return { exam: courseLinkedMatch, discrepancy: false };
  }

  // 2. Match by title substring
  const titleMatch = relevantExams.find(e => isSafeTitleMatch(e.title.toLowerCase(), lockLower));
  if (titleMatch) {
    return { exam: titleMatch, discrepancy: false };
  }

  // 3. Fallback for esertifika (non course-specific e-Sertifika deadlines/schedules)
  if (intent === "esertifika" && relevantExams.length > 0) {
    return { exam: relevantExams[0], discrepancy: false };
  }

  return { exam: null, discrepancy: false };
}

/**
 * Format exam risk title cleanly to avoid redundant repetitions
 */
export function formatExamRiskTitle(title: string): string {
  return title.trim();
}

/**
 * Format risk texts cleanly to prevent repeating terms (e.g. "Final final sınavı")
 */
export function formatExamRiskText(title: string, daysLeft: number): string {
  const cleanTitle = formatExamRiskTitle(title);
  const titleLower = cleanTitle.toLowerCase();
  
  const hasDateKeyword = titleLower.includes("başvuru") || 
                         titleLower.includes("son gün") || 
                         titleLower.includes("deadline") || 
                         titleLower.includes("kayıt");

  if (hasDateKeyword) {
    return `**${cleanTitle}** tarihine sadece ${daysLeft} gün kaldı!`;
  }

  const hasExamKeyword = titleLower.includes("sınav") || 
                         titleLower.includes("sinav") || 
                         titleLower.includes("final") || 
                         titleLower.includes("bütünleme") || 
                         titleLower.includes("butunleme");

  if (hasExamKeyword) {
    return `**${cleanTitle}** tarihine sadece ${daysLeft} gün kaldı!`;
  }

  return `**${cleanTitle}** sınavına sadece ${daysLeft} gün kaldı!`;
}

