// 內建輕量量測器：Engine 1 未接線時的預設，也是測試的基準。
// 演算法對齊 docs/ENGINE-DESIGN.md §1 的定義（簡化版，不算 confidence）。
import type { LocalReport, Measure, Raster, Saliency } from './types'
import { boxBlurGray, lerpScore, resizeMax, sobel, toGray, castVector, meanSat as meanSatUtil } from './util'

/** 亮度直方圖裁切比例（%） */
export function clipPercent(r: Raster): { clipLow: number; clipHigh: number } {
  const g = toGray(r)
  let lo = 0, hi = 0
  for (let i = 0; i < g.length; i++) {
    if (g[i] < 8) lo++
    else if (g[i] > 247) hi++
  }
  return { clipLow: (lo / g.length) * 100, clipHigh: (hi / g.length) * 100 }
}

/**
 * 水平線傾角：灰度先盒狀平滑（r2×2），取梯度強度前 40% 像素，φ = atan2(gy,gx)−90° 折到 (−90,90]，
 * 留 |φ|≤20°，0.5° bin 加權直方圖，峰 bin 拋物線內插。沒有近水平能量回 0。
 */
export function measureTilt(r: Raster): number {
  const small = resizeMax(r, 320)
  // 先平滑：鋸齒邊的階梯踏面會讓梯度全指向 0°，平滑後梯度才垂直於真實線
  const gray = boxBlurGray(toGray(small), small.w, small.h, 2, 2)
  const { mag, gx, gy } = sobel(gray, small.w, small.h)
  const sorted = Float32Array.from(mag).sort()
  const thr = Math.max(sorted[Math.floor(sorted.length * 0.6)], 1)
  const binW = 0.5
  const nb = Math.round(40 / binW) + 1
  const hist = new Float64Array(nb)
  let total = 0
  for (let i = 0; i < mag.length; i++) {
    if (mag[i] <= thr) continue
    let phi = (Math.atan2(gy[i], gx[i]) * 180) / Math.PI - 90
    while (phi <= -90) phi += 180
    while (phi > 90) phi -= 180
    if (Math.abs(phi) > 20) continue
    const b = Math.round((phi + 20) / binW)
    hist[Math.min(nb - 1, Math.max(0, b))] += mag[i]
    total += mag[i]
  }
  if (total <= 0) return 0
  let peak = 0
  for (let b = 1; b < nb; b++) if (hist[b] > hist[peak]) peak = b
  const y0 = hist[Math.max(0, peak - 1)], y1 = hist[peak], y2 = hist[Math.min(nb - 1, peak + 1)]
  const denom = y0 - 2 * y1 + y2
  const off = Math.abs(denom) > 1e-9 ? (0.5 * (y0 - y2)) / denom : 0
  return (peak + off) * binW - 20
}

/** 3×3 Laplacian 變異數 / 灰度變異數 → 分數（設計文件的 THRESHOLDS 表） */
export function measureSharpness(r: Raster): number {
  const mid = resizeMax(r, 480)
  const g = toGray(mid)
  const { w, h } = mid
  let mean = 0
  for (let i = 0; i < g.length; i++) mean += g[i]
  mean /= g.length
  let varG = 0
  for (let i = 0; i < g.length; i++) varG += (g[i] - mean) ** 2
  varG /= g.length
  let lapSum = 0, lapSq = 0, n = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const k = y * w + x
      const lap = g[k - 1] + g[k + 1] + g[k - w] + g[k + w] - 4 * g[k]
      lapSum += lap
      lapSq += lap * lap
      n++
    }
  }
  if (n === 0) return 0
  const lapVar = lapSq / n - (lapSum / n) ** 2
  const sharp = lapVar / (varG + 1e-6)
  return lerpScore(sharp, [[0.002, 10], [0.01, 45], [0.03, 80], [0.08, 100]])
}

/** 8×8 格取 Sobel 能量最低 20% 的平坦格，算減去 3×3 盒狀均值後殘差 std 的中位數 */
export function measureNoiseSigma(r: Raster): number {
  const g = toGray(r)
  const { w, h } = r
  const { mag } = sobel(g, w, h)
  const blurred = boxBlurGray(g, w, h, 1, 1)
  const cw = Math.floor(w / 8), ch = Math.floor(h / 8)
  if (cw < 3 || ch < 3) return 0
  const cells: { energy: number; sigma: number }[] = []
  for (let cy = 0; cy < 8; cy++) {
    for (let cx = 0; cx < 8; cx++) {
      let e = 0, s = 0, s2 = 0, n = 0
      for (let y = cy * ch + 1; y < (cy + 1) * ch - 1; y++) {
        for (let x = cx * cw + 1; x < (cx + 1) * cw - 1; x++) {
          const k = y * w + x
          e += mag[k]
          const d = g[k] - blurred[k]
          s += d
          s2 += d * d
          n++
        }
      }
      if (n > 0) cells.push({ energy: e / n, sigma: Math.sqrt(Math.max(0, s2 / n - (s / n) ** 2)) })
    }
  }
  cells.sort((a, b) => a.energy - b.energy)
  const flat = cells.slice(0, Math.max(1, Math.floor(cells.length * 0.2)))
  const sig = flat.map((c) => c.sigma).sort((a, b) => a - b)
  return sig[Math.floor(sig.length / 2)]
}

/**
 * 顯著度：energy = boxBlur(Sobel mag, r5, 2) + 0.5×與全圖平均 RGB 的距離（正規化），再扣中位數底能量；
 * 取前 20% 能量像素的加權質心、5–95 百分位 bbox、mass。座標 0–1。
 */
export function measureSaliency(r: Raster): Saliency {
  const small = resizeMax(r, 320)
  const { w, h } = small
  const gray = toGray(small)
  const { mag } = sobel(gray, w, h)
  const edge = boxBlurGray(mag, w, h, 5, 2)
  const d = small.data
  let mr = 0, mg = 0, mb = 0
  const n = w * h
  for (let p = 0; p < d.length; p += 4) {
    mr += d[p]
    mg += d[p + 1]
    mb += d[p + 2]
  }
  mr /= n; mg /= n; mb /= n
  const color = new Float32Array(n)
  let maxE = 0, maxC = 0
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    color[i] = Math.hypot(d[p] - mr, d[p + 1] - mg, d[p + 2] - mb)
    if (edge[i] > maxE) maxE = edge[i]
    if (color[i] > maxC) maxC = color[i]
  }
  const energy = new Float32Array(n)
  for (let i = 0; i < n; i++) energy[i] = (maxE > 0 ? edge[i] / maxE : 0) + 0.5 * (maxC > 0 ? color[i] / maxC : 0)
  // 扣掉中位數當背景底：均勻背景微小的色距不該把質心拉向畫面中心
  const floor = Float32Array.from(energy).sort()[Math.floor(n / 2)]
  let sum = 0
  for (let i = 0; i < n; i++) {
    energy[i] = Math.max(0, energy[i] - floor)
    sum += energy[i]
  }
  const meanE = sum / n
  if (meanE <= 1e-9) return { cx: 0.5, cy: 0.5, bbox: { x0: 0, y0: 0, x1: 1, y1: 1 }, mass: 1 }
  const sorted = Float32Array.from(energy).sort()
  const thr = sorted[Math.floor(n * 0.8)]
  const xs: number[] = [], ys: number[] = [], ws: number[] = []
  let sx = 0, sy = 0, sw = 0
  for (let i = 0; i < n; i++) {
    if (energy[i] < thr || energy[i] <= 0) continue // 零能量像素不算主體
    const x = (i % w) + 0.5, y = Math.floor(i / w) + 0.5
    xs.push(x); ys.push(y); ws.push(energy[i])
    sx += x * energy[i]; sy += y * energy[i]; sw += energy[i]
  }
  if (sw <= 0) return { cx: 0.5, cy: 0.5, bbox: { x0: 0, y0: 0, x1: 1, y1: 1 }, mass: 1 }
  const pct = (vals: number[], q: number): number => {
    const idx = vals.map((_, i) => i).sort((a, b) => vals[a] - vals[b])
    let acc = 0
    for (const i of idx) {
      acc += ws[i]
      if (acc >= q * sw) return vals[i]
    }
    return vals[idx[idx.length - 1]]
  }
  return {
    cx: sx / sw / w,
    cy: sy / sw / h,
    bbox: { x0: pct(xs, 0.05) / w, y0: pct(ys, 0.05) / h, x1: pct(xs, 0.95) / w, y1: pct(ys, 0.95) / h },
    mass: sw / ws.length / meanE,
  }
}

/** 內建量測器 */
export const localMeasure: Measure = {
  tilt: measureTilt,
  clipHigh: (r) => clipPercent(r).clipHigh,
  clipLow: (r) => clipPercent(r).clipLow,
  sharpness: measureSharpness,
  noiseSigma: measureNoiseSigma,
  saliency: measureSaliency,
  meanSat: meanSatUtil,
  castMagnitude: (r) => castVector(r).magnitude,
}

/**
 * 用 Engine 1 的 analyze() 建量測器（同一張 raster 只跑一次 analyze，WeakMap 快取）。
 * 接線範例：`setDefaultMeasure(measureFromAnalyze(analyze))`。
 */
export function measureFromAnalyze(analyze: (r: Raster) => LocalReport): Measure {
  const cache = new WeakMap<Raster, LocalReport>()
  const rep = (r: Raster): LocalReport => {
    let v = cache.get(r)
    if (!v) {
      v = analyze(r)
      cache.set(r, v)
    }
    return v
  }
  return {
    tilt: (r) => rep(r).metrics.horizon.raw.tilt,
    clipHigh: (r) => rep(r).metrics.exposure.raw.clipHigh,
    clipLow: (r) => rep(r).metrics.exposure.raw.clipLow,
    sharpness: (r) => rep(r).metrics.sharpness.score,
    noiseSigma: (r) => rep(r).metrics.noise.raw.noiseSigma,
    saliency: (r) => rep(r).saliency,
    meanSat: (r) => rep(r).metrics.colorHarmony.raw.meanSat,
    castMagnitude: (r) => rep(r).metrics.colorHarmony.raw.castMagnitude,
  }
}

let defaultMeasure: Measure = localMeasure
export function setDefaultMeasure(m: Measure): void {
  defaultMeasure = m
}
export function getDefaultMeasure(): Measure {
  return defaultMeasure
}

/**
 * 懶載入 Engine 1 並設為預設量測器（UI 啟動時呼叫一次即可；
 * 動態 import 讓 analyze 不進 variants 的初始 bundle）。
 */
export async function loadAnalyzeMeasure(): Promise<Measure> {
  const { analyze } = await import('../analyze')
  const m = measureFromAnalyze(analyze)
  setDefaultMeasure(m)
  return m
}
