// 色彩：k-means 主色 → 色相分佈分類（單色/互補/三分/分散/中性）、飽和度、中性像素色偏。
import type { ColorRaw, Hint, MetricResult, Raster } from './types'
import { rgb2hsv } from '../raster'
import { THRESHOLDS } from './thresholds'
import { finalizeScore, lerpScore, round } from './scoring'

const T = THRESHOLDS.colorHarmony

export type HarmonyClass = 'mono' | 'complementary' | 'triadic' | 'dispersed' | 'neutral'
export type ColorResult = MetricResult<ColorRaw> & { harmonyClass: HarmonyClass; palette: string[] }

interface Cluster { r: number; g: number; b: number; count: number; hue: number; sat: number }

const hex = (v: number): string => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')
const toHex = (r: number, g: number, b: number): string => `#${hex(r)}${hex(g)}${hex(b)}`
const angDiff = (a: number, b: number): number => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d }

/** 確定性 k-means：初始中心取 4×4×4 直方圖前 k 大 bin 的平均色。 */
function kmeans(samples: Float32Array, k: number, iters: number): Cluster[] {
  const n = samples.length / 3
  const bins = new Float64Array(64 * 4) // sumR,sumG,sumB,count
  for (let i = 0; i < n; i++) {
    const r = samples[i * 3], g = samples[i * 3 + 1], b = samples[i * 3 + 2]
    const bi = ((r >> 6) * 16 + (g >> 6) * 4 + (b >> 6)) * 4
    bins[bi] += r; bins[bi + 1] += g; bins[bi + 2] += b; bins[bi + 3]++
  }
  const order = Array.from({ length: 64 }, (_, i) => i).filter((i) => bins[i * 4 + 3] > 0).sort((a, b) => bins[b * 4 + 3] - bins[a * 4 + 3])
  const kk = Math.min(k, order.length)
  const cent = new Float64Array(kk * 3)
  for (let c = 0; c < kk; c++) {
    const bi = order[c] * 4, cnt = bins[bi + 3]
    cent[c * 3] = bins[bi] / cnt; cent[c * 3 + 1] = bins[bi + 1] / cnt; cent[c * 3 + 2] = bins[bi + 2] / cnt
  }
  const assign = new Uint8Array(n)
  const sums = new Float64Array(kk * 4)
  for (let it = 0; it < iters; it++) {
    sums.fill(0)
    for (let i = 0; i < n; i++) {
      const r = samples[i * 3], g = samples[i * 3 + 1], b = samples[i * 3 + 2]
      let best = 0, bd = Infinity
      for (let c = 0; c < kk; c++) {
        const dr = r - cent[c * 3], dg = g - cent[c * 3 + 1], db = b - cent[c * 3 + 2]
        const d = dr * dr + dg * dg + db * db
        if (d < bd) { bd = d; best = c }
      }
      assign[i] = best
      sums[best * 4] += r; sums[best * 4 + 1] += g; sums[best * 4 + 2] += b; sums[best * 4 + 3]++
    }
    for (let c = 0; c < kk; c++) {
      const cnt = sums[c * 4 + 3]
      if (cnt > 0) { cent[c * 3] = sums[c * 4] / cnt; cent[c * 3 + 1] = sums[c * 4 + 1] / cnt; cent[c * 3 + 2] = sums[c * 4 + 2] / cnt }
    }
  }
  // 群色相取成員的圓形平均（比中心色相穩定）
  const hx = new Float64Array(kk), hy = new Float64Array(kk), satSum = new Float64Array(kk)
  for (let i = 0; i < n; i++) {
    const [hh, s] = rgb2hsv(samples[i * 3], samples[i * 3 + 1], samples[i * 3 + 2])
    const c = assign[i]
    const a = (hh * Math.PI) / 180
    hx[c] += Math.cos(a) * s; hy[c] += Math.sin(a) * s; satSum[c] += s
  }
  const out: Cluster[] = []
  for (let c = 0; c < kk; c++) {
    const cnt = sums[c * 4 + 3]
    if (cnt === 0) continue
    let hue = (Math.atan2(hy[c], hx[c]) * 180) / Math.PI
    if (hue < 0) hue += 360
    out.push({ r: cent[c * 3], g: cent[c * 3 + 1], b: cent[c * 3 + 2], count: cnt, hue, sat: satSum[c] / cnt })
  }
  return out.sort((a, b) => b.count - a.count)
}

/** 把色相相近（≤ tolerance）的群合併成色相組，回傳 {hue, weight}。 */
function hueGroups(clusters: Cluster[], tolerance: number): { hue: number; weight: number }[] {
  const groups: { x: number; y: number; weight: number }[] = []
  for (const c of clusters) {
    const a = (c.hue * Math.PI) / 180
    let merged = false
    for (const g of groups) {
      const gh = ((Math.atan2(g.y, g.x) * 180) / Math.PI + 360) % 360
      if (angDiff(gh, c.hue) <= tolerance) { g.x += Math.cos(a) * c.count; g.y += Math.sin(a) * c.count; g.weight += c.count; merged = true; break }
    }
    if (!merged) groups.push({ x: Math.cos(a) * c.count, y: Math.sin(a) * c.count, weight: c.count })
  }
  return groups.map((g) => ({ hue: ((Math.atan2(g.y, g.x) * 180) / Math.PI + 360) % 360, weight: g.weight })).sort((a, b) => b.weight - a.weight)
}

/** 色偏方向詞與是否屬「暖色系（黃/橙）」——暖色門檻較高以免黃金時刻誤報。 */
function castDirection(castR: number, castB: number): { word: string; warmYellow: boolean } {
  const ang = (Math.atan2(castB, castR) * 180) / Math.PI // (R−G, B−G) 平面
  if (ang > -22.5 && ang <= 22.5) return { word: '偏紅（暖）', warmYellow: false }
  if (ang > 22.5 && ang <= 67.5) return { word: '偏洋紅', warmYellow: false }
  if (ang > 67.5 && ang <= 112.5) return { word: '偏藍紫', warmYellow: false }
  if (ang > 112.5 && ang <= 157.5) return { word: '偏藍（冷）', warmYellow: false }
  if (ang > 157.5 || ang <= -157.5) return { word: '偏青', warmYellow: false }
  if (ang > -157.5 && ang <= -112.5) return { word: '偏綠', warmYellow: false }
  if (ang > -112.5 && ang <= -67.5) return { word: '偏黃', warmYellow: true }
  return { word: '偏橙黃（暖）', warmYellow: true }
}

export function colorHarmony(small: Raster): ColorResult {
  const { w, h, data } = small
  const step = T.sampleStep
  const sw = Math.ceil(w / step), sh = Math.ceil(h / step)
  const samples = new Float32Array(sw * sh * 3)
  let n = 0
  let satSum = 0
  let neutral = 0, lowSat = 0, castRSum = 0, castBSum = 0
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const p = (y * w + x) * 4
      const r = data[p], g = data[p + 1], b = data[p + 2]
      samples[n * 3] = r; samples[n * 3 + 1] = g; samples[n * 3 + 2] = b
      n++
      const [, s, v] = rgb2hsv(r, g, b)
      satSum += s
      if (s < T.neutralSat) {
        lowSat++
        // 色偏只在中間亮度的中性像素量（太暗/太亮通道差不可靠）
        if (v >= T.neutralVLo && v <= T.neutralVHi) { neutral++; castRSum += r - g; castBSum += b - g }
      }
    }
  }
  const meanSat = n > 0 ? satSum / n : 0
  const neutralShare = n > 0 ? lowSat / n : 0
  const castR = neutral > 0 ? castRSum / neutral : 0
  const castB = neutral > 0 ? castBSum / neutral : 0
  const castMagnitude = Math.hypot(castR, castB)

  const clusters = kmeans(samples.subarray(0, n * 3), T.k, T.iterations)
  const palette = clusters.map((c) => toHex(c.r, c.g, c.b))
  const colorful = clusters.filter((c) => c.sat >= T.minClusterSat)
  const colorfulWeight = colorful.reduce((s, c) => s + c.count, 0)

  // 色相圓變異：1 − |Σ w·e^{iθ}| / Σw
  let hx = 0, hy = 0
  for (const c of colorful) { const a = (c.hue * Math.PI) / 180; hx += Math.cos(a) * c.count; hy += Math.sin(a) * c.count }
  const hueDispersion = colorfulWeight > 0 ? 1 - Math.hypot(hx, hy) / colorfulWeight : 0

  let harmonyClass: HarmonyClass
  const groups = hueGroups(colorful, T.angleTolerance).filter((g) => g.weight >= colorfulWeight * 0.1)
  if (colorfulWeight === 0 || colorfulWeight < n * 0.05) harmonyClass = 'neutral'
  else if (hueDispersion < T.monoDispersion || groups.length <= 1) harmonyClass = 'mono'
  else if (groups.length === 2 && Math.abs(angDiff(groups[0].hue, groups[1].hue) - 180) <= T.angleTolerance) harmonyClass = 'complementary'
  else if (
    groups.length === 3 &&
    Math.abs(angDiff(groups[0].hue, groups[1].hue) - 120) <= T.angleTolerance &&
    Math.abs(angDiff(groups[1].hue, groups[2].hue) - 120) <= T.angleTolerance &&
    Math.abs(angDiff(groups[0].hue, groups[2].hue) - 120) <= T.angleTolerance
  ) harmonyClass = 'triadic'
  else harmonyClass = 'dispersed'

  const score = harmonyClass === 'dispersed' ? lerpScore(hueDispersion, T.dispersedScore) : T.harmonyScore[harmonyClass]

  const hints: Hint[] = []
  if (meanSat < T.satLow) hints.push({ principle: 'saturation', severity: 'info', text: `平均飽和度約 ${round(meanSat, 2)}，接近低飽和/黑白` })
  else if (meanSat > T.satHigh) hints.push({ principle: 'saturation', severity: 'warn', text: `平均飽和度約 ${round(meanSat, 2)}，整體偏高` })
  if (neutral > 0) {
    const dir = castDirection(castR, castB)
    const thr = dir.warmYellow ? T.castWarnWarm : T.castWarn
    if (castMagnitude > thr) {
      hints.push({ principle: 'white-balance', severity: 'warn', text: `中性區域${dir.word}約 ${Math.round(castMagnitude)} 階（R−G ${Math.round(castR)}、B−G ${Math.round(castB)}）` })
    }
  }
  if (harmonyClass === 'dispersed' && groups.length >= 4) {
    hints.push({ principle: 'color-harmony', severity: 'info', text: `畫面約有 ${groups.length} 組相異色相，色相分散度 ${round(hueDispersion, 2)}` })
  }

  let confidence = 1
  if (neutralShare > T.neutralShareConfPenaltyAt) confidence -= T.neutralShareConfPenalty

  return {
    raw: {
      meanSat: round(meanSat, 3),
      hueDispersion: round(hueDispersion, 3),
      castR: round(castR, 1),
      castB: round(castB, 1),
      castMagnitude: round(castMagnitude, 1),
      neutralShare: round(neutralShare, 3),
    },
    score: finalizeScore(score),
    confidence: round(confidence, 3),
    hints,
    harmonyClass,
    palette,
  }
}
