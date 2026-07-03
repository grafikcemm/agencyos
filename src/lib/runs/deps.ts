// Kanonik run/step bağımlılık grafiği — saf mantık (DB'siz, test edilebilir).
// Migration 038 `run_step_dependencies` ilişki tablosunu kurar; burada o kenarlar
// üzerinde topolojik sıralama + çevrim tespiti yapılır (depends_on UUID[] yerine
// ilişki tablosu kararı, plan §3-3).

export interface DepEdge {
  stepId: string
  dependsOnStepId: string
}

export type TopoResult = { ok: true; order: string[] } | { ok: false; cycle: string[] }

// Kahn topolojik sıralama. Bir kenar (stepId → dependsOnStepId) "dependsOn önce
// gelmeli" demektir. Çevrim varsa ok:false + çevrimdeki düğümler döner.
export function topoSort(stepIds: string[], edges: DepEdge[]): TopoResult {
  const nodes = new Set(stepIds)
  const inDegree = new Map<string, number>()
  const dependents = new Map<string, string[]>() // dependsOn → [stepler]

  for (const id of nodes) {
    inDegree.set(id, 0)
    dependents.set(id, [])
  }

  for (const e of edges) {
    // Bilinmeyen düğüm veya kendine-bağımlılık → geçersiz kenar / çevrim.
    if (!nodes.has(e.stepId) || !nodes.has(e.dependsOnStepId)) continue
    if (e.stepId === e.dependsOnStepId) return { ok: false, cycle: [e.stepId] }
    inDegree.set(e.stepId, (inDegree.get(e.stepId) ?? 0) + 1)
    dependents.get(e.dependsOnStepId)!.push(e.stepId)
  }

  // in-degree 0 olanlar hazır. Deterministik olsun diye giriş sırasını koru.
  const queue: string[] = stepIds.filter((id) => (inDegree.get(id) ?? 0) === 0)
  const order: string[] = []

  while (queue.length > 0) {
    const id = queue.shift()!
    order.push(id)
    for (const dep of dependents.get(id) ?? []) {
      const d = (inDegree.get(dep) ?? 0) - 1
      inDegree.set(dep, d)
      if (d === 0) queue.push(dep)
    }
  }

  if (order.length !== nodes.size) {
    // Sıralanamayan düğümler çevrimdedir.
    const cycle = stepIds.filter((id) => !order.includes(id))
    return { ok: false, cycle }
  }
  return { ok: true, order }
}

export function hasCycle(stepIds: string[], edges: DepEdge[]): boolean {
  return topoSort(stepIds, edges).ok === false
}
