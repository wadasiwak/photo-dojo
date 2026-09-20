// Engine 1 入口。純函式、同步、無 DOM。
//
// 對外匯出（Engine 2 / UI 依賴）：
//   analyze(r: Raster): LocalReport                                   — 一次跑全部指標
//   saliency(edges: Edges, small: Raster): Saliency                    — 主體質心/bbox/mass（edges = sobel(toGray(small))）
//   exposure(gray: Float32Array, w: number, h: number): MetricResult<ExposureRaw>
//   thirds(sal: Saliency, symmetryScore?: number): MetricResult<ThirdsRaw>
//   horizon(edges: Edges, w: number, h: number): MetricResult<HorizonRaw>       — tilt 正 = 順時鐘（右側較低）
//   negativeSpace(mag: Float32Array, w: number, h: number): MetricResult<NegativeSpaceRaw>
//   leadingLines(edges: Edges, w: number, h: number, sal: Saliency): MetricResult<LeadingLinesRaw>
//   colorHarmony(small: Raster): ColorResult                           — MetricResult<ColorRaw> + harmonyClass + palette
//   sharpness(gray: Float32Array, w: number, h: number, sal?: Saliency): MetricResult<SharpnessRaw>  — gray 建議 480 長邊
//   noise(gray: Float32Array, w: number, h: number): MetricResult<NoiseRaw>     — gray 建議 480 長邊
//   symmetry(gray: Float32Array, w: number, h: number): MetricResult<SymmetryRaw>
//   prepare(r: Raster): Prepared                                       — 縮圖/灰度/邊緣（Engine 2 守門重跑單一指標時可重用）
//   THRESHOLDS, lerpScore, clamp
import type { Hint, LocalReport, MetricResult, Raster } from './types'
import { resize, sobel, toGray } from '../raster'
import { THRESHOLDS } from './thresholds'
import { exposure } from './exposure'
import { saliency } from './saliency'
import type { Edges } from './saliency'
import { thirds } from './thirds'
import { horizon } from './horizon'
import { negativeSpace } from './negativeSpace'
import { leadingLines } from './leadingLines'
import { colorHarmony } from './colorHarmony'
import { sharpness } from './sharpness'
import { noise } from './noise'
import { symmetry } from './symmetry'

export type * from './types'
export type { Edges } from './saliency'
export type { HarmonyClass, ColorResult } from './colorHarmony'
export type { DetectedLine } from './leadingLines'
export { THRESHOLDS } from './thresholds'
export { lerpScore, clamp } from './scoring'
export { exposure, saliency, thirds, horizon, negativeSpace, leadingLines, colorHarmony, sharpness, noise, symmetry }
export { houghLines } from './leadingLines'
export { saliencyWithEnergy } from './saliency'

export interface Prepared {
  /** 長邊 320 */
  small: Raster
  gray: Float32Array
  edges: Edges
  /** 長邊 480，給 sharpness / noise */
  mid: Raster
  grayMid: Float32Array
}

/** 縮圖、灰度、Sobel 一次算好。 */
export function prepare(r: Raster): Prepared {
  const small = resize(r, THRESHOLDS.workSide)
  const gray = toGray(small)
  const edges = sobel(gray, small.w, small.h)
  const mid = resize(r, THRESHOLDS.detailSide)
  const grayMid = mid === small ? gray : toGray(mid)
  return { small, gray, edges, mid, grayMid }
}

/** severity warn 優先、同 principle 只留第一個。 */
export function mergeHints(all: Hint[]): Hint[] {
  const sorted = [...all].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'warn' ? -1 : 1))
  const seen = new Set<string>()
  const out: Hint[] = []
  for (const hnt of sorted) {
    if (seen.has(hnt.principle)) continue
    seen.add(hnt.principle)
    out.push(hnt)
  }
  return out
}

export function analyze(r: Raster): LocalReport {
  const { small, gray, edges, mid, grayMid } = prepare(r)
  const { w, h } = small
  const sal = saliency(edges, small)
  const sym = symmetry(gray, w, h)
  const metrics: LocalReport['metrics'] = {
    exposure: exposure(gray, w, h),
    thirds: thirds(sal, sym.score),
    horizon: horizon(edges, w, h),
    negativeSpace: negativeSpace(edges.mag, w, h),
    leadingLines: leadingLines(edges, w, h, sal),
    colorHarmony: colorHarmony(small),
    sharpness: sharpness(grayMid, mid.w, mid.h, sal),
    noise: noise(grayMid, mid.w, mid.h),
    symmetry: sym,
  }

  // overall：confidence ≥ 0.3 的指標依權重加權；全部不合格時退回簡單平均
  const weights = THRESHOLDS.overall.weights
  let ws = 0, acc = 0
  for (const key of Object.keys(weights)) {
    const m = (metrics as Record<string, MetricResult>)[key]
    if (!m || m.confidence < THRESHOLDS.overall.minConfidence) continue
    ws += weights[key]
    acc += weights[key] * m.score
  }
  let overall: number
  if (ws > 0) overall = acc / ws
  else {
    const all = Object.values(metrics) as MetricResult[]
    overall = all.reduce((s, m) => s + m.score, 0) / all.length
  }

  const hints = mergeHints((Object.values(metrics) as MetricResult[]).flatMap((m) => m.hints))
  return {
    size: { w: r.w, h: r.h },
    metrics,
    saliency: sal,
    overall: Math.round(Math.min(100, Math.max(0, overall))),
    hints,
    disclaimer: 'reference-indicators',
  }
}

