// 主體估計：邊緣能量（模糊後 Sobel）+ 色彩獨特性 → 前 20% 能量像素的加權質心與 bbox。
import type { Raster, Saliency } from './types'
import { boxBlurGray } from '../raster'
import { THRESHOLDS } from './thresholds'
import { percentileSorted, round } from './scoring'

const T = THRESHOLDS.saliency

export interface Edges { mag: Float32Array; gx: Float32Array; gy: Float32Array }

/** 回傳能量圖（供除錯/可視化）與 Saliency。 */
export function saliencyWithEnergy(edges: Edges, small: Raster): { sal: Saliency; energy: Float32Array } {
  const { w, h, data } = small
  const n = w * h
  const blurred = boxBlurGray(edges.mag, w, h, T.blurRadius, T.blurPasses)

  // 全圖平均 RGB
  let mr = 0, mg = 0, mb = 0
  for (let i = 0, p = 0; i < n; i++, p += 4) { mr += data[p]; mg += data[p + 1]; mb += data[p + 2] }
  mr /= n; mg /= n; mb /= n

  const color = new Float32Array(n)
  let sumE = 0, sumC = 0
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    color[i] = Math.hypot(data[p] - mr, data[p + 1] - mg, data[p + 2] - mb)
    sumE += blurred[i]
    sumC += color[i]
  }
  // 兩項各以自身平均正規化（平均 = 1），再以 1 : 0.5 加總
  const nE = sumE > 0 ? n / sumE : 0
  const nC = sumC > 0 ? n / sumC : 0
  const energy = new Float32Array(n)
  let total = 0
  for (let i = 0; i < n; i++) {
    energy[i] = blurred[i] * nE + T.colorWeight * color[i] * nC
    total += energy[i]
  }
  const full: Saliency = { cx: 0.5, cy: 0.5, bbox: { x0: 0, y0: 0, x1: 1, y1: 1 }, mass: 1 }
  if (total <= 1e-9) return { sal: full, energy }

  const sorted = Float32Array.from(energy).sort()
  const thr = percentileSorted(sorted, (1 - T.topFraction) * 100)
  // 嚴格大於門檻，避免平坦背景大量同值像素被一起選進來；太少再退回 ≥
  let strict = true
  let count = 0
  for (let i = 0; i < n; i++) if (energy[i] > thr) count++
  if (count < n * 0.01) strict = false

  const xs: number[] = [], ys: number[] = []
  let sx = 0, sy = 0, sw = 0
  for (let i = 0; i < n; i++) {
    const e = energy[i]
    if (strict ? e > thr : e >= thr) {
      const x = i % w, y = (i - x) / w
      xs.push(x); ys.push(y)
      sx += x * e; sy += y * e; sw += e
    }
  }
  if (sw <= 0 || xs.length === 0) return { sal: full, energy }
  const xsS = Float32Array.from(xs).sort(), ysS = Float32Array.from(ys).sort()
  const mean = total / n
  const kept = sw / xs.length
  const sal: Saliency = {
    cx: round((sx / sw + 0.5) / w, 4),
    cy: round((sy / sw + 0.5) / h, 4),
    bbox: {
      x0: round(percentileSorted(xsS, T.bboxLoPct) / w, 4),
      y0: round(percentileSorted(ysS, T.bboxLoPct) / h, 4),
      x1: round((percentileSorted(xsS, T.bboxHiPct) + 1) / w, 4),
      y1: round((percentileSorted(ysS, T.bboxHiPct) + 1) / h, 4),
    },
    mass: round(mean > 0 ? kept / mean : 1, 3),
  }
  return { sal, energy }
}

export function saliency(edges: Edges, small: Raster): Saliency {
  return saliencyWithEnergy(edges, small).sal
}
