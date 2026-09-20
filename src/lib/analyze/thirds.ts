// 三分法：主體質心到最近三分交點的距離（0–1 座標歐氏距離）。
import type { Hint, MetricResult, Saliency, ThirdsRaw } from './types'
import { THRESHOLDS } from './thresholds'
import { finalizeScore, lerpScore, round } from './scoring'

const T = THRESHOLDS.thirds
const POINTS: [number, number][] = [[1 / 3, 1 / 3], [2 / 3, 1 / 3], [1 / 3, 2 / 3], [2 / 3, 2 / 3]]

/**
 * @param sal saliency()
 * @param symmetryScore symmetry().score，用來保護刻意置中的對稱構圖
 */
export function thirds(sal: Saliency, symmetryScore = 0): MetricResult<ThirdsRaw> {
  const { cx, cy, bbox, mass } = sal
  let dThirds = Infinity
  for (const [px, py] of POINTS) dThirds = Math.min(dThirds, Math.hypot(cx - px, cy - py))
  const dCenter = Math.hypot(cx - 0.5, cy - 0.5)
  const edgeDist = Math.min(cx, 1 - cx, cy, 1 - cy)
  const touched = [bbox.x0 <= T.bboxTouch, bbox.y0 <= T.bboxTouch, bbox.x1 >= 1 - T.bboxTouch, bbox.y1 >= 1 - T.bboxTouch].filter(Boolean).length

  let score = lerpScore(dThirds, T.score)
  const centered = dCenter < T.centerDist
  if (centered && symmetryScore > T.centerSymmetryScore) score = Math.max(score, T.centerFloor)

  const hints: Hint[] = []
  if (edgeDist < T.edgeDist) {
    hints.push({ principle: 'subject-placement', severity: 'warn', text: `主體質心距畫面邊緣僅約 ${Math.round(edgeDist * 100)}%` })
  } else if (touched > 1) {
    hints.push({ principle: 'subject-placement', severity: 'warn', text: `主體範圍同時觸及 ${touched} 個畫面邊` })
  }
  if (centered) {
    hints.push({ principle: 'rule-of-thirds', severity: 'info', text: `主體約在正中央（距中心 ${round(dCenter, 2)}），距最近三分交點約 ${round(dThirds, 2)}` })
  } else if (dThirds > T.score[1][0]) {
    hints.push({ principle: 'rule-of-thirds', severity: 'info', text: `主體質心距最近三分交點約 ${round(dThirds, 2)}（畫面比例）` })
  }

  return {
    raw: { dThirds: round(dThirds, 4), dCenter: round(dCenter, 4), edgeDist: round(edgeDist, 4) },
    score: finalizeScore(score),
    confidence: round(lerpScore(mass, T.confidence), 3),
    hints,
  }
}
