"use client"

import { useState } from "react"
import { useCareerState } from "@/hooks/useCareerState"
import { SkillTracks } from "./SkillTracks"
import { SkillCard } from "./SkillCard"
import { ArchivedCareerItems } from "./ArchivedCareerItems"
import {
  getAllActiveSkills,
  STRATEGIC_INSURANCE_SKILLS,
  BACKLOG_PROJECTS,
  CAREER_SKILLS,
  type CareerSkill,
} from "@/data/careerRoadmap"
import type { CareerCockpit, MonthProgress } from "@/lib/career/cockpit"
import { PageHeader } from "@/components/ui/PageHeader"

// ─────────────────────────────────────────────────────────────────────────────
// GELİŞİM — KARİYER KOKPİTİ
//
// ÖNCE: 45 eş ağırlıklı beceri kartı, 67 kaynak linki, bağlamsız bir "Adobe
// After Effects" odak kartı ve geniş boş alan. Ekran "hangi beceri?" diye
// soruyordu; oysa kullanıcı beceri değil KARİYER ÇIKTISI seçer.
//
// SONRA: kuzey yıldızı → güncel ay → bu haftanın TEK teslimi → kanıt → kapasite.
// Tam yetkinlik haritası, kaynaklar, backlog, arşiv ve Fiziksel Kariyer
// Sigortası yalnız ihtiyaç anında açılır.
//
// Kurallar: docs/ui-principles-2026-08-10.md §4.3 (karar yüzeyi seyrek), §4.4
// (durum rengi anlamlı), §4.5 (sayı + kırılım, "ölçülmedi" ≠ 0).
// ─────────────────────────────────────────────────────────────────────────────

function skillGroupId(skill: CareerSkill): string {
  return skill.category === "kalici" ? "kalici" : skill.subgroup ?? "teknik"
}

/** Durum renkleri — dört anlamdan biri. Dekoratif renk yok. */
const STATE_TONE: Record<MonthProgress["state"], string> = {
  done: "text-[var(--success)] border-[var(--success)]/30",
  current: "text-[var(--accent)] border-[var(--accent)]/40",
  next: "text-[var(--text-secondary)] border-[var(--border-subtle)]",
  locked: "text-[var(--text-tertiary)] border-[var(--border-subtle)]",
}

const STATE_LABEL: Record<MonthProgress["state"], string> = {
  done: "tamamlandı",
  current: "güncel faz",
  next: "sıradaki",
  locked: "bağımlılıkla kilitli",
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-tertiary)]">
      {children}
    </p>
  )
}

/** Büyük sayı + altında TEK satır kırılım. Ölçülmemiş değer "—" gösterir. */
function Stat({
  value,
  label,
  detail,
  tone = "text-[var(--text-primary)]",
}: {
  value: string
  label: string
  detail: string
  tone?: string
}) {
  return (
    <div className="min-w-0">
      <p className={`font-display text-2xl leading-none tabular-nums ${tone}`}>{value}</p>
      <p className="mt-1.5 text-[11px] font-medium text-[var(--text-secondary)]">{label}</p>
      <p className="mt-0.5 text-[11px] text-[var(--text-tertiary)] truncate">{detail}</p>
    </div>
  )
}

function Disclosure({
  title,
  hint,
  children,
  open,
  onToggle,
}: {
  title: string
  hint?: string
  children: React.ReactNode
  /** Dışarıdan açılabilir — birincil CTA tam haritayı açar. */
  open?: boolean
  onToggle?: (open: boolean) => void
}) {
  return (
    <details
      className="group rounded-card border border-[var(--border-subtle)] bg-[var(--bg-base)]/30 overflow-hidden"
      open={open}
      onToggle={(e) => onToggle?.((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="flex cursor-pointer select-none items-center justify-between gap-3 p-4 text-left">
        <span className="min-w-0">
          <span className="block text-xs font-medium text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">
            {title}
          </span>
          {hint && <span className="mt-0.5 block text-[11px] text-[var(--text-tertiary)]">{hint}</span>}
        </span>
        <span className="shrink-0 font-mono text-sm text-[var(--text-tertiary)]">
          <span className="group-open:hidden">+</span>
          <span className="hidden group-open:inline">−</span>
        </span>
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  )
}

export function GrowthPage({ cockpit }: { cockpit: CareerCockpit }) {
  const {
    hydrated,
    activeFocusSkillId,
    completedSkillIds,
    setActiveFocus,
    setKnowledgeStatus,
    completeSkill,
    getSkillStatus,
  } = useCareerState()

  const [showMap, setShowMap] = useState(false)

  const { current, weekMilestone, evidence, capacity, lanes, nextBlocker, months, northStar } = cockpit

  const capacityValue =
    capacity.actualHours == null ? "—" : `${capacity.actualHours}/${capacity.plannedHours}`
  const capacityDetail =
    capacity.source === "olculmedi"
      ? "ölçülmedi — GrafikcemOS köprüsü kapalı"
      : `${capacity.loadClass ?? "yoğunluk bilinmiyor"}${capacity.hasConflict ? " · çakışma var" : ""}`

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-8 lg:px-6">
      {/* 1 — KUZEY YILDIZI + GÜNCEL AY */}
      <PageHeader
        eyebrow="// Kariyer rotası"
        title={northStar.identity}
        description={northStar.sequence}
        compact
        className="mb-5"
      />

      {/* 2 — BU HAFTANIN TEK ANA TESLİMİ (birincil karar alanı) */}
      <section
        aria-labelledby="week-milestone"
        className="rounded-card border border-[var(--accent)]/30 bg-dark-card p-5 shadow-soft"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded border border-[var(--accent)]/40 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[var(--accent)]">
            Ay {current.month.order} · {current.month.title}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
            hafta {weekMilestone.index}/{weekMilestone.total}
          </span>
        </div>

        <h2 id="week-milestone" className="mt-3 font-display text-lg leading-snug text-[var(--text-primary)]">
          {weekMilestone.title}
        </h2>
        <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-muted)]">
          Ayın çıktısı: {current.month.primaryOutcome}
        </p>

        {/* Tek birincil çağrı — açık ve tekil. */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowMap(true)}
            className="rounded-lg bg-[var(--accent)] px-3.5 py-2 text-xs font-semibold text-white transition-transform duration-150 hover:scale-[1.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] motion-reduce:transition-none motion-reduce:hover:scale-100"
          >
            Kanıt ekle
          </button>
          {current.awaiting.length > 0 && (
            <span className="text-[11px] text-[var(--text-tertiary)]">
              {current.awaiting.length} kanıt bekliyor
            </span>
          )}
        </div>
      </section>

      {/* 3 — KANIT + KAPASİTE + ŞERİTLER */}
      <section className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="rounded-card border border-dark-border bg-dark-card p-4 shadow-soft">
          <Stat
            value={`${current.verifiedCount}/${current.totalCount}`}
            label="Bu ayın kanıtı"
            detail={
              evidence.unreachable > 0
                ? `${evidence.unreachable} kanıt erişilemez`
                : evidence.grace > 0
                  ? `${evidence.grace} kanıt yeniden deneniyor`
                  : `${evidence.pending} bekliyor · ${evidence.verified} doğrulandı`
            }
            tone={
              evidence.unreachable > 0
                ? "text-[var(--danger,#ef4444)]"
                : "text-[var(--text-primary)]"
            }
          />
        </div>

        <div className="rounded-card border border-dark-border bg-dark-card p-4 shadow-soft">
          <Stat value={capacityValue} label="Haftalık kapasite (saat)" detail={capacityDetail} />
        </div>

        <div className="rounded-card border border-dark-border bg-dark-card p-4 shadow-soft">
          <Eyebrow>sürekli şeritler</Eyebrow>
          <ul className="mt-2 space-y-1.5">
            {lanes
              .filter((l) => l.lane.weeklyHours > 0)
              .map(({ lane, recentProof }) => (
                <li key={lane.id} className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[11px] text-[var(--text-secondary)]">{lane.title}</span>
                  <span
                    className={`shrink-0 font-mono text-[10px] ${
                      recentProof ? "text-[var(--success)]" : "text-[var(--text-tertiary)]"
                    }`}
                  >
                    {recentProof ? "taze" : "kanıt bekliyor"}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      </section>

      {/* 4 — SIRADAKİ ENGEL: tek satır, liste değil */}
      {nextBlocker && (
        <p className="mt-3 rounded-card border border-[var(--warning,#f59e0b)]/30 bg-[var(--bg-base)]/40 px-4 py-3 text-xs leading-relaxed text-[var(--text-secondary)]">
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--warning,#f59e0b)]">
            sıradaki engel ·{" "}
          </span>
          {nextBlocker}
        </p>
      )}

      {(cockpit.degraded.evidence || cockpit.degraded.capacity) && (
        <p className="mt-3 rounded-card border border-[var(--border-subtle)] px-4 py-2.5 text-[11px] text-[var(--text-tertiary)]">
          {cockpit.degraded.evidence && "Kanıt kaynağı okunamadı (LIFE migration 008 uygulanmamış olabilir). "}
          {cockpit.degraded.capacity && "Kapasite köprüsü kapalı — saat ölçülmedi, sıfır değil."}
        </p>
      )}

      {/* 5 — DÖRT AYLIK ROTA: özet şerit, açık ay dışındakiler tek satır */}
      <section className="mt-6" aria-label="Dört aylık rota">
        <Eyebrow>dört aylık üretim rotası</Eyebrow>
        <ol className="mt-2 space-y-1.5">
          {months.map((m) => {
            const isCurrent = m.state === "current"
            return (
              <li
                key={m.month.id}
                className={`rounded-card border bg-dark-card px-4 py-3 ${STATE_TONE[m.state]} ${
                  isCurrent ? "" : "opacity-70"
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="text-xs font-semibold text-[var(--text-primary)]">
                    Ay {m.month.order} · {m.month.title}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-wider">
                    {STATE_LABEL[m.state]} · {m.verifiedCount}/{m.totalCount} kanıt
                  </span>
                </div>
                {isCurrent && (
                  <ul className="mt-2 space-y-1">
                    {m.month.evidenceRequirements.map((r) => {
                      const done = m.satisfied.includes(r.id)
                      return (
                        <li key={r.id} className="flex items-baseline gap-2 text-[11px]">
                          <span
                            aria-hidden
                            className={done ? "text-[var(--success)]" : "text-[var(--text-tertiary)]"}
                          >
                            {done ? "✓" : "○"}
                          </span>
                          <span className={done ? "text-[var(--text-muted)]" : "text-[var(--text-secondary)]"}>
                            {r.title}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
                {m.state === "locked" && m.lockedBy.length > 0 && (
                  <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
                    Kilit: {m.lockedBy.join(", ")}
                  </p>
                )}
              </li>
            )
          })}
        </ol>
      </section>

      {/* 6 — GÜNCEL AYIN KAYNAKLARI: en fazla üç, bağlama bağlı */}
      <section className="mt-4">
        <Eyebrow>bu ayın kaynakları (en fazla 3)</Eyebrow>
        <ul className="mt-2 flex flex-wrap gap-2">
          {current.month.resources.slice(0, 3).map((r) => (
            <li key={r.url}>
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-2.5 py-1.5 text-[11px] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                {r.title}
                {r.free && <span className="font-mono text-[9px] text-[var(--success)]">ücretsiz</span>}
              </a>
            </li>
          ))}
        </ul>
      </section>

      {/* 7 — İHTİYAÇ ANINDA AÇILANLAR */}
      <section className="mt-6 space-y-2">
        <Disclosure
          title={`Tam yetkinlik haritası (${CAREER_SKILLS.length} yetkinlik)`}
          hint="Kalıcı pratik sistemi + teknik hatlar. Ana rotayı işgal etmez."
          open={showMap}
          onToggle={setShowMap}
        >
          {!hydrated ? (
            <div className="h-24 animate-pulse rounded-card border border-dark-border bg-dark-card motion-reduce:animate-none" />
          ) : (
            <SkillTracks
              activeFocusSkillId={activeFocusSkillId}
              completedSkillIds={completedSkillIds}
              getSkillStatus={getSkillStatus}
              onStatusChange={setKnowledgeStatus}
              onSetFocus={setActiveFocus}
              onComplete={completeSkill}
            />
          )}
        </Disclosure>

        <Disclosure
          title="İkincil pratik"
          hint="Ana dört aylık sırayla çelişen ama korunan gerçek kullanıcı seçimleri."
        >
          {hydrated && (
            <div className="space-y-2">
              {getAllActiveSkills()
                .filter((s) => s.id === "after-effects-motion" || s.id === "ai-ad-ugc-creative")
                .map((skill) => (
                  <SkillCard
                    key={skill.id}
                    skill={skill}
                    groupId={skillGroupId(skill)}
                    currentStatus={getSkillStatus(skill.id)}
                    isCompleted={completedSkillIds.includes(skill.id)}
                    isActiveFocus={skill.id === activeFocusSkillId}
                    onStatusChange={setKnowledgeStatus}
                    onSetFocus={setActiveFocus}
                    onComplete={completeSkill}
                  />
                ))}
            </div>
          )}
        </Disclosure>

        <Disclosure title="Fiziksel Kariyer Sigortası" hint="Aktif hedef değil — gelecek opsiyonu.">
          {hydrated && (
            <div className="space-y-2">
              {STRATEGIC_INSURANCE_SKILLS.map((skill) => (
                <SkillCard
                  key={skill.id}
                  skill={skill}
                  groupId="strategic"
                  currentStatus={getSkillStatus(skill.id)}
                  isCompleted={completedSkillIds.includes(skill.id)}
                  isActiveFocus={skill.id === activeFocusSkillId}
                  onStatusChange={setKnowledgeStatus}
                  onSetFocus={setActiveFocus}
                  onComplete={completeSkill}
                />
              ))}
            </div>
          )}
        </Disclosure>

        <Disclosure title={`Backlog (${BACKLOG_PROJECTS.length})`} hint="Sırası gelmemiş projeler.">
          <div className="space-y-2">
            {BACKLOG_PROJECTS.map((project) => (
              <div
                key={project.id}
                className="rounded-card border border-[var(--border-subtle)] bg-dark-card p-3"
              >
                <p className="text-sm text-[var(--text-primary)]">{project.title}</p>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">{project.note}</p>
              </div>
            ))}
          </div>
        </Disclosure>

        <Disclosure title="Arşiv" hint="Park edilenler ve kitaplık deposu.">
          <ArchivedCareerItems />
        </Disclosure>
      </section>
    </div>
  )
}
