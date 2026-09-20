// overexpose / underexpose（exposure）：LUT 255·(in/255)^γ + offset。
// 守門：套後裁切需 +5pt 以上（否則升一級重試一次）、≤ +45pt（否則 ×0.75）。
import { FLAWS, GUARD_BANDS } from '../registry'
import { applyLUT, makeLUT } from '../util'
import type { FlawId, Measure, Raster } from '../types'
import { num, round, type FlawImpl } from './common'

function makeExposureFlaw(id: 'overexpose' | 'underexpose'): FlawImpl {
  const over = id === 'overexpose'
  const clip = (m: Measure, r: Raster): number => (over ? m.clipHigh(r) : m.clipLow(r))
  return {
    id: id as FlawId,
    guard(report) {
      const e = report.metrics.exposure.raw
      // 已經幾乎全裁切的圖沒空間再壞
      return over ? e.clipHigh < 40 : e.clipLow < 40
    },
    plan(r, difficulty) {
      const t = FLAWS[id].tiers[difficulty]
      // 小幅抖動讓不同 seed 參數不同，但仍落在該難度感受區
      const gamma = round(t.gamma * (1 + (r() - 0.5) * 0.06), 3)
      const offset = round(t.offset + (r() - 0.5) * 4, 1)
      return { gamma, offset }
    },
    render(params, strength, ctx) {
      const gamma = round(1 + (num(params, 'gamma') - 1) * strength, 3)
      const offset = round(num(params, 'offset') * strength, 1)
      const lut = makeLUT((v) => 255 * (v / 255) ** gamma + offset)
      return { raster: applyLUT(ctx.src, lut), cropApplied: null, params: { gamma, offset } }
    },
    check(out, _params, _strength, ctx) {
      const delta = clip(ctx.measure, out) - clip(ctx.measure, ctx.src)
      if (delta < GUARD_BANDS.clipDelta.min) return 'weak'
      if (delta > GUARD_BANDS.clipDelta.max) return 'strong'
      return 'ok'
    },
    explain(_params, out, ctx) {
      const pct = clip(ctx.measure, out).toFixed(0)
      return over
        ? `整體過曝，亮部約 ${pct}% 接近純白，細節被洗掉了`
        : `整體過暗，暗部約 ${pct}% 沉成死黑，主體看不清楚`
    },
  }
}

export const overexposeFlaw = makeExposureFlaw('overexpose')
export const underexposeFlaw = makeExposureFlaw('underexpose')
