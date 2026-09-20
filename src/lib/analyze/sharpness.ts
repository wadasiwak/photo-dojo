// 清晰度：3×3 Laplacian 變異數（全圖與主體 bbox），以灰度變異數正規化。
import type { Hint, MetricResult, Saliency, SharpnessRaw } from './types'
import { THRESHOLDS } from './thresholds'
import { finalizeScore, lerpScore, meanStd, round } from './scoring'

const T = THRESHOLDS.sharpness

/** 4 鄰域 Laplacian 在矩形區域（像素座標、含 x0/y0、不含 x1/y1）內的變異數；邊界 1px 不算。 */
function laplacianVar(gray: Float32Array, w: number, h: number, x0: number, y0: number, x1: number, y1: number): number {
  const xa = Math.max(1, x0), ya = Math.max(1, y0), xb = Math.min(w - 1, x1), yb = Math.min(h - 1, y1)
  if (xb - xa < 1 || yb - ya < 1) return 0
  let s = 0, s2 = 0, c = 0
  for (let y = ya; y < yb; y++) {
    for (let x = xa; x < xb; x++) {
      const i = y * w + x
      const lap = gray[i - 1] + gray[i + 1] + gray[i - w] + gray[i + w] - 4 * gray[i]
      s += lap; s2 += lap * lap; c++
    }
  }
  if (c === 0) return 0
  const m = s / c
  return s2 / c - m * m
}

/**
 * @param gray 較高解析度（480）灰度
 * @param sal 主體 bbox（0–1）；省略時視為全圖
 */
export function sharpness(gray: Float32Array, w: number, h: number, sal?: Saliency): MetricResult<SharpnessRaw> {
  const { std } = meanStd(gray)
  const lapVarGlobal = laplacianVar(gray, w, h, 0, 0, w, h)
  const bb = sal?.bbox ?? { x0: 0, y0: 0, x1: 1, y1: 1 }
  let x0 = Math.floor(bb.x0 * w), y0 = Math.floor(bb.y0 * h), x1 = Math.ceil(bb.x1 * w), y1 = Math.ceil(bb.y1 * h)
  // bbox 太小（<8px）就退回全圖
  if (x1 - x0 < 8 || y1 - y0 < 8) { x0 = 0; y0 = 0; x1 = w; y1 = h }
  const lapVarSubject = laplacianVar(gray, w, h, x0, y0, x1, y1)
  const sharp = lapVarSubject / (std * std + T.eps)
  const score = finalizeScore(lerpScore(sharp, T.score))
  const confidence = round(lerpScore(std, T.confidence), 3)
  const hints: Hint[] = []
  if (score < T.hintScore && confidence > T.hintConf) {
    hints.push({ principle: 'sharpness', severity: 'warn', text: `主體區域清晰度指標約 ${round(sharp, 4)}，偏低（可能失焦、手震或散景）` })
  }
  return {
    raw: { sharp: round(sharp, 5), lapVarGlobal: round(lapVarGlobal, 1), lapVarSubject: round(lapVarSubject, 1), grayStd: round(std, 2) },
    score,
    confidence,
    hints,
  }
}
