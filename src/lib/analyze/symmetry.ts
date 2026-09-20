// 對稱：左右 / 上下鏡像誤差（以平均絕對偏差正規化）。只保護置中構圖與 info，從不 warn。
import type { Hint, MetricResult, SymmetryRaw } from './types'
import { THRESHOLDS } from './thresholds'
import { clamp, finalizeScore, lerpScore, round } from './scoring'

const T = THRESHOLDS.symmetry

export function symmetry(gray: Float32Array, w: number, h: number): MetricResult<SymmetryRaw> {
  const n = w * h
  let sum = 0
  for (let i = 0; i < n; i++) sum += gray[i]
  const mean = sum / n
  let mad = 0
  for (let i = 0; i < n; i++) mad += Math.abs(gray[i] - mean)
  mad /= n
  let lr = 0, tb = 0
  for (let y = 0; y < h; y++) {
    const row = y * w, mrow = (h - 1 - y) * w
    for (let x = 0; x < w; x++) {
      lr += Math.abs(gray[row + x] - gray[row + (w - 1 - x)])
      tb += Math.abs(gray[row + x] - gray[mrow + x])
    }
  }
  const flatImage = mad < 1e-3
  const errLR = flatImage ? 0 : lr / n / mad
  const errTB = flatImage ? 0 : tb / n / mad
  const sym = clamp(1 - Math.min(errLR, errTB), 0, 1)
  const hints: Hint[] = []
  if (!flatImage && sym > T.hintSym) {
    hints.push({ principle: 'symmetry', severity: 'info', text: `畫面${errLR <= errTB ? '左右' : '上下'}鏡像相似度約 ${Math.round(sym * 100)}%` })
  }
  return {
    raw: { symmetry: round(sym, 3), errLR: round(errLR, 3), errTB: round(errTB, 3) },
    score: finalizeScore(lerpScore(sym, T.score)),
    confidence: flatImage ? 0.2 : T.confidence,
    hints,
  }
}
