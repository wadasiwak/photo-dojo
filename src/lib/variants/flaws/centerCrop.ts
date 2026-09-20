// centerCrop（rule-of-thirds）：把原本在三分點的主體裁到正中央。
// 視窗比例依難度（0.85/0.8/0.7），若質心太靠邊會再縮視窗（下限 0.5）以確保能真正置中。
import { FLAWS } from '../registry'
import { clamp, crop, resizeTo } from '../util'
import { saliencyOf } from './cropSubject'
import { num, round, type FlawImpl } from './common'

export const centerCropFlaw: FlawImpl = {
  id: 'centerCrop',
  guard(report) {
    return report.metrics.thirds.raw.dThirds < 0.12 && report.metrics.symmetry.score < 60
  },
  plan(r, difficulty, ctx) {
    const t = FLAWS.centerCrop.tiers[difficulty]
    const sal = saliencyOf(ctx)
    const { w: W, h: H } = ctx.src
    // 讓質心真的落在視窗中心所需的最大視窗比例
    const feasible = 2 * Math.min(sal.cx, 1 - sal.cx, sal.cy, 1 - sal.cy)
    const jitter = (r() - 0.5) * 0.04
    const f = round(clamp(Math.min(t.window + jitter, feasible), 0.5, 0.95), 3)
    const fw = Math.round(W * f), fh = Math.round(H * f)
    return {
      window: f,
      x: Math.round(clamp(sal.cx * W - fw / 2, 0, W - fw)),
      y: Math.round(clamp(sal.cy * H - fh / 2, 0, H - fh)),
      w: fw,
      h: fh,
      srcCx: round(sal.cx, 3),
      srcCy: round(sal.cy, 3),
    }
  },
  render(params, _strength, ctx) {
    const cut = crop(ctx.src, num(params, 'x'), num(params, 'y'), num(params, 'w'), num(params, 'h'))
    return { raster: resizeTo(cut, ctx.src.w, ctx.src.h), cropApplied: null }
  },
  explain() {
    return '主體被塞在正中央，四周留白平均，構圖少了張力和方向感'
  },
}
