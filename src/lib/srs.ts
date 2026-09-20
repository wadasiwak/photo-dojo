// 鑑賞測驗 SRS：簡化 Leitner 三箱。答錯的原則權重升高 → 更常被抽到。
// box 0 = 剛錯/未學（權重 3）、box 1 = 答對一次（權重 2）、box 2 = 連對兩次以上（權重 1）。
import type { PrincipleId } from '../content/principles.ts'

export interface PrincipleStat {
  box: 0 | 1 | 2
  correct: number
  wrong: number
  streak: number
}
export type SrsState = Partial<Record<PrincipleId, PrincipleStat>>

const BOX_WEIGHT = [3, 2, 1] as const

export const emptyStat = (): PrincipleStat => ({ box: 0, correct: 0, wrong: 0, streak: 0 })

export function weightOf(state: SrsState, p: PrincipleId): number {
  const s = state[p]
  return s ? BOX_WEIGHT[s.box] : 3
}

export function weightsOf(state: SrsState, ids: readonly PrincipleId[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const id of ids) out[id] = weightOf(state, id)
  return out
}

/** 答題後更新；回傳新 state（不 mutate） */
export function recordAnswer(state: SrsState, principles: readonly PrincipleId[], correct: boolean): SrsState {
  const next: SrsState = { ...state }
  for (const p of principles) {
    const s = { ...(next[p] ?? emptyStat()) }
    if (correct) {
      s.correct++
      s.streak++
      if (s.streak >= 2 && s.box < 2) s.box = (s.box + 1) as 0 | 1 | 2
      else if (s.box === 0) s.box = 1
    } else {
      s.wrong++
      s.streak = 0
      s.box = 0
    }
    next[p] = s
  }
  return next
}

export function accuracy(s: PrincipleStat | undefined): number | null {
  if (!s || s.correct + s.wrong === 0) return null
  return s.correct / (s.correct + s.wrong)
}

/** 等級：以總答對數 + 連勝換算 */
export function levelOf(totalCorrect: number): { level: number; title: string; next: number } {
  const steps = [0, 10, 25, 50, 90, 150, 250, 400]
  const titles = ['新手', '入門', '學徒', '練習生', '有眼光', '鑑賞家', '老手', '達人']
  let lv = 0
  for (let i = 0; i < steps.length; i++) if (totalCorrect >= steps[i]) lv = i
  return { level: lv + 1, title: titles[lv], next: steps[lv + 1] ?? Infinity }
}
