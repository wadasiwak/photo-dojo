// cropSubject（subject-placement）：用 saliency 裁 70–80% 視窗，
// hard/medium 讓質心貼邊（edgeDist 目標 0.08 / 0.03），easy 直接切掉 bbox 25–45%。
// 視窗比例會依主體位置縮到可行值（下限 0.5），否則主體離邊太遠時推不到邊。
import { FLAWS } from '../registry'
import type { Saliency } from '../types'
import { clamp, crop, resizeTo } from '../util'
import { num, round, uniform, type FlawImpl, type FlawContext } from './common'

type Edge = 'left' | 'right' | 'top' | 'bottom'
const EDGES: readonly Edge[] = ['left', 'right', 'top', 'bottom']

export function saliencyOf(ctx: FlawContext): Saliency {
  return ctx.report?.saliency ?? ctx.measure.saliency(ctx.src)
}

type Mode = 'edgeDist' | 'cut'

/**
 * 該邊能用的最大視窗比例 f（0–1 座標）。
 * edgeDist 模式：質心到指定邊的距離 = amount×視窗邊長，且視窗不出界。
 * cut 模式：視窗邊界切進 bbox amount 比例，且視窗不出界。
 */
function maxWindow(edge: Edge, mode: Mode, amount: number, sal: Saliency): number {
  const { cx, cy, bbox: b } = sal
  const bw = b.x1 - b.x0, bh = b.y1 - b.y0
  if (mode === 'edgeDist') {
    switch (edge) {
      case 'left': return (1 - cx) / (1 - amount)
      case 'right': return cx / (1 - amount)
      case 'top': return (1 - cy) / (1 - amount)
      case 'bottom': return cy / (1 - amount)
    }
  }
  switch (edge) {
    case 'left': return 1 - b.x0 - amount * bw
    case 'right': return b.x1 - amount * bw
    case 'top': return 1 - b.y0 - amount * bh
    case 'bottom': return b.y1 - amount * bh
  }
}

/** 視窗左上角（0–1 座標，未 clamp）：目標邊依模式定位，另一軸以質心為中心 */
function windowOrigin(edge: Edge, mode: Mode, amount: number, sal: Saliency, f: number): { x: number; y: number } {
  const { cx, cy, bbox: b } = sal
  const bw = b.x1 - b.x0, bh = b.y1 - b.y0
  let x = cx - f / 2, y = cy - f / 2
  if (mode === 'edgeDist') {
    if (edge === 'left') x = cx - amount * f
    if (edge === 'right') x = cx - (1 - amount) * f
    if (edge === 'top') y = cy - amount * f
    if (edge === 'bottom') y = cy - (1 - amount) * f
  } else {
    if (edge === 'left') x = b.x0 + amount * bw
    if (edge === 'right') x = b.x1 - amount * bw - f
    if (edge === 'top') y = b.y0 + amount * bh
    if (edge === 'bottom') y = b.y1 - amount * bh - f
  }
  return { x, y }
}

/** 視窗比例下限：再小就不像同一張照片 */
const MIN_WINDOW = 0.5

export const cropSubjectFlaw: FlawImpl = {
  id: 'cropSubject',
  guard(report) {
    const s = report.saliency
    const area = (s.bbox.x1 - s.bbox.x0) * (s.bbox.y1 - s.bbox.y0)
    return s.mass >= 2 && area < 0.4
  },
  plan(r, difficulty, ctx) {
    const t = FLAWS.cropSubject.tiers[difficulty]
    const fDrawn = uniform(r, t.windowMin, t.windowMax)
    const sal = saliencyOf(ctx)
    const { w: W, h: H } = ctx.src
    const mode: Mode = difficulty === 'easy' ? 'cut' : 'edgeDist'
    const amount = mode === 'cut' ? uniform(r, t.cutMin, t.cutMax) : t.edgeDist
    // 從隨機起點輪詢 4 邊：主體離哪邊近，哪邊就做得到；選第一個視窗 ≥ 下限的邊，
    // 都做不到就取可行視窗最大的那邊、硬用下限（守門會抓）
    const start = Math.floor(r() * 4)
    let best: { edge: Edge; fmax: number } | null = null
    for (let i = 0; i < 4; i++) {
      const edge = EDGES[(start + i) % 4]
      const fmax = maxWindow(edge, mode, amount, sal)
      if (!best || fmax > best.fmax) best = { edge, fmax }
      if (fmax >= MIN_WINDOW) break
    }
    const { edge, fmax } = best!
    const f = round(clamp(Math.min(fDrawn, fmax), MIN_WINDOW, 1), 3)
    const fw = Math.round(W * f), fh = Math.round(H * f)
    const o = windowOrigin(edge, mode, amount, sal, f)
    return {
      edge,
      mode,
      amount,
      window: f,
      x: Math.round(clamp(o.x * W, 0, W - fw)),
      y: Math.round(clamp(o.y * H, 0, H - fh)),
      w: fw,
      h: fh,
      srcCx: round(sal.cx, 3),
      srcCy: round(sal.cy, 3),
    }
  },
  render(params, _strength, ctx) {
    const x = num(params, 'x'), y = num(params, 'y'), w = num(params, 'w'), h = num(params, 'h')
    const cut = crop(ctx.src, x, y, w, h)
    return { raster: resizeTo(cut, ctx.src.w, ctx.src.h), cropApplied: null }
  },
  explain(params) {
    return params.mode === 'cut'
      ? '主體被切掉一塊，視線沒地方落、畫面也不完整'
      : '主體被擠到邊緣，前方沒留空間，畫面看起來擠又不穩'
  },
}
