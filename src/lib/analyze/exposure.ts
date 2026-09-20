// 曝光：256 bin 直方圖 → 剪裁比例、中位數、p5/p95 動態範圍。
import type { ExposureRaw, Hint, MetricResult } from './types'
import { THRESHOLDS } from './thresholds'
import { finalizeScore, lerpScore, round } from './scoring'

const T = THRESHOLDS.exposure

/** 直方圖是否雙峰（剪影/高低調常見，判讀信心降低）。 */
function isBimodal(hist: Float64Array): boolean {
  // 先 5 bin 平滑
  const n = hist.length
  const sm = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    let s = 0, c = 0
    for (let k = -2; k <= 2; k++) {
      const j = i + k
      if (j >= 0 && j < n) { s += hist[j]; c++ }
    }
    sm[i] = s / c
  }
  let max = 0
  for (let i = 0; i < n; i++) max = Math.max(max, sm[i])
  if (max === 0) return false
  // 找局部極大（> 5% 最大峰）
  const peaks: number[] = []
  for (let i = 0; i < n; i++) {
    const l = i > 0 ? sm[i - 1] : -1, r = i < n - 1 ? sm[i + 1] : -1
    if (sm[i] >= l && sm[i] > r && sm[i] > max * 0.05) peaks.push(i)
  }
  if (peaks.length < 2) return false
  peaks.sort((a, b) => sm[b] - sm[a])
  const [p1, p2] = peaks
  if (Math.abs(p1 - p2) < T.bimodalPeakDist * n) return false
  const lo = Math.min(p1, p2), hi = Math.max(p1, p2)
  let valley = Infinity
  for (let i = lo; i <= hi; i++) valley = Math.min(valley, sm[i])
  return valley < T.bimodalValleyRatio * Math.min(sm[p1], sm[p2])
}

export function exposure(gray: Float32Array, w: number, h: number): MetricResult<ExposureRaw> {
  const n = w * h
  const hist = new Float64Array(256)
  let sum = 0
  for (let i = 0; i < n; i++) {
    const v = Math.min(255, Math.max(0, Math.round(gray[i])))
    hist[v]++
    sum += gray[i]
  }
  let clipLow = 0, clipHigh = 0
  for (let v = 0; v < T.clipLowLevel; v++) clipLow += hist[v]
  for (let v = T.clipHighLevel + 1; v < 256; v++) clipHigh += hist[v]
  clipLow = (clipLow / n) * 100
  clipHigh = (clipHigh / n) * 100

  // 由直方圖求百分位
  const pct = (p: number): number => {
    const target = (p / 100) * n
    let acc = 0
    for (let v = 0; v < 256; v++) {
      acc += hist[v]
      if (acc >= target) return v
    }
    return 255
  }
  const median = pct(50)
  const p5 = pct(5), p95 = pct(95)
  const dynamicRange = p95 - p5
  const mean = sum / n

  const penalty =
    lerpScore(clipHigh, T.clipHighPenalty) +
    lerpScore(clipLow, T.clipHighPenalty) * T.clipLowWeight +
    lerpScore(Math.abs(median - T.medianTarget), T.medianPenalty)
  const drScore = lerpScore(dynamicRange, T.drScore)
  // 主體是扣分制；DR 子分只輕微拉動（flat 中灰仍需 ≥95，故權重小）
  const score = finalizeScore(100 - penalty - (100 - drScore) * T.drWeight)

  const hints: Hint[] = []
  if (clipHigh > T.hintClipHigh) hints.push({ principle: 'exposure', severity: 'warn', text: `亮部約 ${Math.round(clipHigh)}% 的像素接近純白（>${T.clipHighLevel}）` })
  if (clipLow > T.hintClipLow) hints.push({ principle: 'exposure', severity: 'warn', text: `暗部約 ${Math.round(clipLow)}% 的像素接近純黑（<${T.clipLowLevel}）` })
  if (dynamicRange < T.hintDrLow) hints.push({ principle: 'dynamic-range', severity: 'info', text: `亮暗範圍約 ${dynamicRange} 階（p5–p95），整體對比偏平` })

  const confidence = isBimodal(hist) ? T.bimodalConfidence : 1

  return {
    raw: { clipLow: round(clipLow, 2), clipHigh: round(clipHigh, 2), median, mean: round(mean, 1), dynamicRange, drScore: round(drScore, 1) },
    score,
    confidence,
    hints,
  }
}
