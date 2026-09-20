// 分數映射工具：門檻全部是資料（斷點表），程式碼不寫死。

export type Breakpoints = readonly (readonly [number, number])[]

export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x)

/**
 * 分段線性映射。pts 依 x 遞增排列，例 lerpScore(dist, [[0.05,100],[0.12,75],[0.25,40]])：
 * x ≤ 第一點 → 第一點的 s；x ≥ 最後一點 → 最後一點的 s；中間線性內插。
 */
export function lerpScore(x: number, pts: Breakpoints): number {
  if (pts.length === 0) return 0
  if (Number.isNaN(x)) return pts[0][1]
  if (x <= pts[0][0]) return pts[0][1]
  const last = pts[pts.length - 1]
  if (x >= last[0]) return last[1]
  for (let i = 1; i < pts.length; i++) {
    const [x1, s1] = pts[i]
    if (x <= x1) {
      const [x0, s0] = pts[i - 1]
      const t = x1 === x0 ? 1 : (x - x0) / (x1 - x0)
      return s0 + (s1 - s0) * t
    }
  }
  return last[1]
}

/** 0–100 取整並夾住。 */
export const finalizeScore = (s: number): number => Math.round(clamp(s, 0, 100))

/** 保留 n 位小數（raw 值用，避免 JSON 一長串）。 */
export const round = (x: number, n = 3): number => {
  const f = 10 ** n
  return Math.round(x * f) / f
}

/** 排序後陣列的百分位（0–100，線性內插）。 */
export function percentileSorted(sorted: ArrayLike<number>, p: number): number {
  const n = sorted.length
  if (n === 0) return 0
  const pos = (clamp(p, 0, 100) / 100) * (n - 1)
  const lo = Math.floor(pos)
  const hi = Math.min(n - 1, lo + 1)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

/** 平均值與標準差。 */
export function meanStd(a: ArrayLike<number>): { mean: number; std: number } {
  const n = a.length
  if (n === 0) return { mean: 0, std: 0 }
  let s = 0
  for (let i = 0; i < n; i++) s += a[i]
  const mean = s / n
  let v = 0
  for (let i = 0; i < n; i++) {
    const d = a[i] - mean
    v += d * d
  }
  return { mean, std: Math.sqrt(v / n) }
}
