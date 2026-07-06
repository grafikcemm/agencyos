"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import type { CareerSkillStatus } from "@/data/careerRoadmap"
import { getCareerState, saveCareerState, type CareerState } from "@/app/actions/careerActions"

// localStorage yalnızca çevrimdışı önbellek/yedek. Source of truth = Supabase.
const STATE_KEY = "feed-the-goat-career-roadmap-state-v1"
const KNOWLEDGE_KEY = "feed-the-goat-career-knowledge-status-v1"

interface CareerRoadmapState {
  activeLevelId: string | null
  activeFocusSkillId: string | null
  completedSkillIds: string[]
}

const DEFAULT_STATE: CareerRoadmapState = {
  activeLevelId: null,
  activeFocusSkillId: null,
  completedSkillIds: [],
}

function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function saveToStorage<T>(key: string, value: T): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // kota hatalarını yoksay
  }
}

export function useCareerState() {
  const [state, setState] = useState<CareerRoadmapState>(DEFAULT_STATE)
  const [knowledgeStatus, setKnowledgeStatusMap] = useState<Record<string, CareerSkillStatus>>({})
  const [hydrated, setHydrated] = useState(false)

  // Persist artık setState updater'ından DEĞİL, aşağıdaki effect'ten yapılır —
  // updater saf olmalı (StrictMode/concurrent'ta iki kez çağrılabilir; içindeki
  // network yazımı çift Supabase upsert + commit edilmemiş state'in persist'i demekti).
  // lastSyncedRef: hydrate'ten gelen sunucu verisini sunucuya GERİ yazmayı önler.
  const lastSyncedRef = useRef<string | null>(null)

  // İlk yükleme: Supabase source of truth. Başarısız olursa localStorage yedeği.
  useEffect(() => {
    let cancelled = false

    // Önce yerel önbelleği göster (anlık UI), sonra Supabase ile üzerine yaz.
    const cachedState = loadFromStorage(STATE_KEY, DEFAULT_STATE)
    const cachedKnowledge = loadFromStorage(KNOWLEDGE_KEY, {})
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from localStorage cache on mount — intentional
    setState(cachedState)
    setKnowledgeStatusMap(cachedKnowledge)

    getCareerState()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          // Supabase erişilemedi → yerel önbellekle çalışmaya devam et.
          console.warn("career_state okunamadı, yerel yedek kullanılıyor:", error)
          setHydrated(true)
          return
        }
        const nextState: CareerRoadmapState = {
          activeLevelId: data.activeLevelId,
          activeFocusSkillId: data.activeFocusSkillId,
          completedSkillIds: data.completedSkillIds,
        }
        setState(nextState)
        setKnowledgeStatusMap(data.knowledgeStatus)
        saveToStorage(STATE_KEY, nextState)
        saveToStorage(KNOWLEDGE_KEY, data.knowledgeStatus)
        setHydrated(true)
      })
      .catch(err => {
        if (cancelled) return
        console.warn("career_state yüklenemedi, yerel yedek kullanılıyor:", err)
        setHydrated(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  // Tek noktadan Supabase'e yaz (full upsert). Yerel önbelleği de güncelle.
  const persist = useCallback(
    (nextState: CareerRoadmapState, nextKnowledge: Record<string, CareerSkillStatus>) => {
      saveToStorage(STATE_KEY, nextState)
      saveToStorage(KNOWLEDGE_KEY, nextKnowledge)
      const payload: CareerState = {
        activeLevelId: nextState.activeLevelId,
        activeFocusSkillId: nextState.activeFocusSkillId,
        completedSkillIds: nextState.completedSkillIds,
        knowledgeStatus: nextKnowledge,
      }
      void saveCareerState(payload).then(res => {
        if (!res.success) {
          console.warn("career_state yazılamadı (yerel önbellek korunuyor):", res.error)
        }
      })
    },
    []
  )

  // Değişiklikleri hydrate SONRASI tek noktadan persist et (updater'lar saf kalır).
  useEffect(() => {
    if (!hydrated) return
    const snapshot = JSON.stringify({ state, knowledgeStatus })
    if (lastSyncedRef.current === null) {
      // Hydrate'in kendisi — sunucudan/önbellekten gelen veriyi geri yazma.
      lastSyncedRef.current = snapshot
      return
    }
    if (lastSyncedRef.current === snapshot) return
    lastSyncedRef.current = snapshot
    persist(state, knowledgeStatus)
  }, [state, knowledgeStatus, hydrated, persist])

  const updateState = useCallback((patch: Partial<CareerRoadmapState>) => {
    setState(prev => ({ ...prev, ...patch }))
  }, [])

  const setActiveFocus = useCallback(
    (skillId: string, levelId: string) => {
      updateState({ activeFocusSkillId: skillId, activeLevelId: levelId })
    },
    [updateState]
  )

  const clearActiveFocus = useCallback(() => {
    updateState({ activeFocusSkillId: null, activeLevelId: null })
  }, [updateState])

  const setKnowledgeStatus = useCallback((skillId: string, status: CareerSkillStatus) => {
    setKnowledgeStatusMap(prev => ({ ...prev, [skillId]: status }))
  }, [])

  const completeSkill = useCallback((skillId: string) => {
    setState(prev => {
      const alreadyDone = prev.completedSkillIds.includes(skillId)
      const completedSkillIds = alreadyDone
        ? prev.completedSkillIds.filter(id => id !== skillId)
        : [...prev.completedSkillIds, skillId]
      const patch: Partial<CareerRoadmapState> = { completedSkillIds }
      if (!alreadyDone && prev.activeFocusSkillId === skillId) {
        patch.activeFocusSkillId = null
        patch.activeLevelId = null
      }
      return { ...prev, ...patch }
    })
  }, [])

  const isSkillCompleted = useCallback(
    (skillId: string) => {
      return state.completedSkillIds.includes(skillId)
    },
    [state.completedSkillIds]
  )

  const getSkillStatus = useCallback(
    (skillId: string): CareerSkillStatus => {
      return knowledgeStatus[skillId] ?? "not_started"
    },
    [knowledgeStatus]
  )

  return {
    hydrated,
    activeLevelId: state.activeLevelId,
    activeFocusSkillId: state.activeFocusSkillId,
    completedSkillIds: state.completedSkillIds,
    knowledgeStatus,
    setActiveFocus,
    clearActiveFocus,
    setKnowledgeStatus,
    completeSkill,
    isSkillCompleted,
    getSkillStatus,
  }
}
