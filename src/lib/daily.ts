import { CHALLENGES, type Challenge } from '../content/index.ts'
import { hashString, mulberry32 } from './seed.ts'

/** 日期 → 當日任務（確定性；連續兩天不重複） */
export function pickDailyChallenge(date: string): Challenge {
  const r = mulberry32(hashString(`photo-dojo-daily:${date}`))
  const i = Math.floor(r() * CHALLENGES.length)
  return CHALLENGES[i]
}
export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`
}
