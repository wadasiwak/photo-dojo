// 雜訊：在最平坦的格子裡量「減去 3×3 均值後的殘差 std」→ 校正回白雜訊 σ。
import type { Hint, MetricResult, NoiseRaw } from './types'
import { boxBlurGray, sobel } from '../raster'
import { THRESHOLDS } from './thresholds'
import { finalizeScore, lerpScore, percentileSorted, round } from './scoring'

const T = THRESHOLDS.noise
/** 平坦候選格的平均 Sobel 幅度上限；σ10 的白雜訊本身約 43，紋理格通常 >100 */
const FLAT_MAG_MAX = 60
/** 白雜訊 x − mean3×3 的變異數為 σ²·(8/9) */
const RESIDUAL_CORRECTION = Math.sqrt(9 / 8)

/** @param gray 較高解析度（480）灰度 */
export function noise(gray: Float32Array, w: number, h: number): MetricResult<NoiseRaw> {
  const g = T.grid
  const cells = g * g
  const { mag } = sobel(gray, w, h)
  const cellMag = new Float64Array(cells), cellCnt = new Float64Array(cells)
  for (let y = 0; y < h; y++) {
    const cy = Math.min(g - 1, Math.floor((y / h) * g))
    for (let x = 0; x < w; x++) {
      const c = cy * g + Math.min(g - 1, Math.floor((x / w) * g))
      cellMag[c] += mag[y * w + x]; cellCnt[c]++
    }
  }
  for (let c = 0; c < cells; c++) cellMag[c] = cellCnt[c] > 0 ? cellMag[c] / cellCnt[c] : Infinity
  const order = Array.from({ length: cells }, (_, i) => i).sort((a, b) => cellMag[a] - cellMag[b])
  const flat = order.slice(0, Math.max(1, Math.round(cells * T.flatFraction))).filter((c) => cellMag[c] <= FLAT_MAG_MAX)

  const blurred = boxBlurGray(gray, w, h, 1, 1)
  const sigmas: number[] = []
  const cw = w / g, ch = h / g
  for (const c of flat) {
    const cx = c % g, cy = (c - cx) / g
    // 格內縫 1px，避開格邊/影像邊
    const x0 = Math.max(1, Math.floor(cx * cw) + 1), x1 = Math.min(w - 1, Math.floor((cx + 1) * cw) - 1)
    const y0 = Math.max(1, Math.floor(cy * ch) + 1), y1 = Math.min(h - 1, Math.floor((cy + 1) * ch) - 1)
    let s = 0, s2 = 0, k = 0
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const d = gray[y * w + x] - blurred[y * w + x]; s += d; s2 += d * d; k++ }
    if (k < 4) continue
    const m = s / k
    sigmas.push(Math.sqrt(Math.max(0, s2 / k - m * m)) * RESIDUAL_CORRECTION)
  }
  const noiseSigma = sigmas.length ? percentileSorted(Float64Array.from(sigmas).sort(), 50) : 0
  const score = finalizeScore(lerpScore(noiseSigma, T.score))
  const confidence = sigmas.length < T.minFlatCells ? T.lowConfidence : T.confidence
  const hints: Hint[] = []
  if (score < T.hintScore) hints.push({ principle: 'noise', severity: 'warn', text: `平坦區域雜訊標準差約 ${round(noiseSigma, 1)} 階` })
  return {
    raw: { noiseSigma: round(noiseSigma, 2), flatCells: sigmas.length },
    score,
    confidence,
    hints,
  }
}
