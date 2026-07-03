// Faz 0 golden set kaydı. Yeni golden setler buraya eklenir; golden.test.ts
// tümünü koşar. (JARVIS tool-routing golden'ı engine.ts'e saf bir pre-router
// export'u gerektirir — davranışı bozmamak için Faz 1'e ertelendi.)

import type { RunnableGoldenSet } from './harness'
import { intentGolden, personaGolden } from './cases/mentorRoute'
import { councilParityGolden } from './cases/councilParity'

export const allGoldenSets: RunnableGoldenSet[] = [
  intentGolden,
  personaGolden,
  councilParityGolden,
]

export { runGolden } from './harness'
export type { GoldenReport, SetReport } from './harness'
