// 引導線：粗 Hough（θ 4° × 45 bin、ρ 4px）找強直線，判斷是否交會於主體。只給 info、從不 warn。
import type { Hint, LeadingLinesRaw, MetricResult, Saliency } from './types'
import type { Edges } from './saliency'
import { THRESHOLDS } from './thresholds'
import { finalizeScore, lerpScore, percentileSorted, round } from './scoring'

const T = THRESHOLDS.leadingLines

export interface DetectedLine {
  /** 法向角（弧度，0–π） */
  theta: number
  /** 像素座標 ρ = x cosθ + y sinθ */
  rho: number
  votes: number
  /** votes / 該線在圖內的最大可能票數，>1 會 cap */
  length: number
}

/** 線 (θ, ρ) 被影像框裁切後的長度（px）。 */
function clippedLength(theta: number, rho: number, w: number, h: number): number {
  const c = Math.cos(theta), s = Math.sin(theta)
  const pts: [number, number][] = []
  if (Math.abs(s) > 1e-6) {
    for (const x of [0, w - 1]) { const y = (rho - x * c) / s; if (y >= -0.5 && y <= h - 0.5) pts.push([x, y]) }
  }
  if (Math.abs(c) > 1e-6) {
    for (const y of [0, h - 1]) { const x = (rho - y * s) / c; if (x >= -0.5 && x <= w - 0.5) pts.push([x, y]) }
  }
  if (pts.length < 2) return 0
  let best = 0
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) best = Math.max(best, Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]))
  return best
}

export function houghLines(edges: Edges, w: number, h: number): DetectedLine[] {
  const { mag } = edges
  const n = w * h
  const thr = percentileSorted(Float32Array.from(mag).sort(), T.magPercentile)
  const nT = T.thetaBins
  const diag = Math.ceil(Math.hypot(w, h))
  const nR = Math.ceil((2 * diag) / T.rhoStep) + 1
  const acc = new Float64Array(nT * nR)
  const cosT = new Float64Array(nT), sinT = new Float64Array(nT)
  for (let t = 0; t < nT; t++) { const th = (t * Math.PI) / nT; cosT[t] = Math.cos(th); sinT[t] = Math.sin(th) }
  const vx: number[] = [], vy: number[] = []
  for (let i = 0; i < n; i++) {
    if (!(mag[i] > thr)) continue
    const x = i % w
    vx.push(x); vy.push((i - x) / w)
  }
  if (vx.length === 0) return []
  const alive = new Uint8Array(vx.length).fill(1)
  const vote = (idx: number, sign: number): void => {
    const x = vx[idx], y = vy[idx]
    for (let t = 0; t < nT; t++) {
      const r = Math.round((x * cosT[t] + y * sinT[t] + diag) / T.rhoStep)
      acc[t * nR + r] += sign
    }
  }
  for (let i = 0; i < vx.length; i++) vote(i, 1)

  // 逐峰取出；每取一條就把它的支持像素（距線 ≤ suppressDist px）票數全扣掉，避免同一條線沿 θ 產生多個峰
  const lines: DetectedLine[] = []
  for (let k = 0; k < T.peaks; k++) {
    let best = -1, bestV = 0
    for (let i = 0; i < acc.length; i++) if (acc[i] > bestV) { bestV = acc[i]; best = i }
    if (best < 0 || bestV <= 0) break
    const t = Math.floor(best / nR), r = best - t * nR
    let theta = (t * Math.PI) / nT
    let rho = r * T.rhoStep - diag
    // 用支持像素做 PCA 精修 (θ, ρ)：Hough 4°/4px 太粗，長線兩端會偏好幾 px，影響交點與後續抑制
    let c = cosT[t], sn = sinT[t]
    let mx = 0, my = 0, cnt = 0
    for (let i = 0; i < vx.length; i++) {
      if (alive[i] && Math.abs(vx[i] * c + vy[i] * sn - rho) <= T.suppressDist) { mx += vx[i]; my += vy[i]; cnt++ }
    }
    if (cnt >= 3) {
      mx /= cnt; my /= cnt
      let sxx = 0, sxy = 0, syy = 0
      for (let i = 0; i < vx.length; i++) {
        if (!(alive[i] && Math.abs(vx[i] * c + vy[i] * sn - rho) <= T.suppressDist)) continue
        const dx = vx[i] - mx, dy = vy[i] - my
        sxx += dx * dx; sxy += dx * dy; syy += dy * dy
      }
      const dir = 0.5 * Math.atan2(2 * sxy, sxx - syy) // 主軸（線方向）
      let th = dir + Math.PI / 2 // 法向
      while (th < 0) th += Math.PI
      while (th >= Math.PI) th -= Math.PI
      theta = th; c = Math.cos(th); sn = Math.sin(th)
      rho = mx * c + my * sn
    }
    const maxVotes = clippedLength(theta, rho, w, h)
    lines.push({ theta, rho, votes: bestV, length: maxVotes > 0 ? Math.min(1, bestV / maxVotes) : 0 })
    for (let i = 0; i < vx.length; i++) {
      if (!alive[i]) continue
      if (Math.abs(vx[i] * c + vy[i] * sn - rho) <= T.suppressDist) { alive[i] = 0; vote(i, -1) }
    }
  }
  return lines
}

/** 兩線交點（像素），平行回 null。 */
function intersect(a: DetectedLine, b: DetectedLine): [number, number] | null {
  const c1 = Math.cos(a.theta), s1 = Math.sin(a.theta), c2 = Math.cos(b.theta), s2 = Math.sin(b.theta)
  const det = c1 * s2 - s1 * c2
  if (Math.abs(det) < 1e-6) return null
  return [(a.rho * s2 - b.rho * s1) / det, (c1 * b.rho - c2 * a.rho) / det]
}

export function leadingLines(edges: Edges, w: number, h: number, sal: Saliency): MetricResult<LeadingLinesRaw> {
  const minVotes = T.minVotesFrac * Math.min(w, h)
  const lines = houghLines(edges, w, h).filter((l) => l.length > T.minLength && l.votes >= minVotes)
  const lineCount = lines.length
  let convergent = 0
  for (let i = 0; i < lines.length && !convergent; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const p = intersect(lines[i], lines[j])
      if (!p) continue
      const d = Math.hypot(p[0] / w - sal.cx, p[1] / h - sal.cy)
      if (d < T.convergeDist) { convergent = 1; break }
    }
  }
  const score = finalizeScore(lerpScore(lineCount, T.score) + (convergent ? T.convergentBonus : 0))
  const hints: Hint[] = []
  if (lineCount >= 2) {
    hints.push({
      principle: 'leading-lines',
      severity: 'info',
      text: convergent ? `偵測到約 ${lineCount} 條明顯直線，交會處接近主體` : `偵測到約 ${lineCount} 條明顯直線`,
    })
  }
  return {
    raw: { lineCount, convergent, maxLength: round(lines.reduce((m, l) => Math.max(m, l.length), 0), 3) },
    score,
    confidence: T.confidence,
    hints,
  }
}
