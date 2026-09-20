// blur（sharpness）：盒狀模糊，半徑以長邊 800px 為基準依 ctx.scale 縮放。
// 守門：清晰度分數需掉 25–70（不足升一級、過頭 ×0.75）。
import { FLAWS, GUARD_BANDS } from '../registry'
import { boxBlurRaster } from '../util'
import { num, round, type FlawImpl } from './common'

export const blurFlaw: FlawImpl = {
  id: 'blur',
  guard(report) {
    return report.metrics.sharpness.score >= 60
  },
  plan(r, difficulty) {
    const t = FLAWS.blur.tiers[difficulty]
    return { radius: round(t.radius * (1 + (r() - 0.5) * 0.2)) }
  },
  render(params, strength, ctx) {
    const radius = round(num(params, 'radius') * strength)
    const px = Math.max(0.5, radius * ctx.scale)
    return { raster: boxBlurRaster(ctx.src, px, 1), cropApplied: null, params: { radius, radiusPx: round(px) } }
  },
  check(out, _params, _strength, ctx) {
    const drop = ctx.measure.sharpness(ctx.src) - ctx.measure.sharpness(out)
    if (drop < GUARD_BANDS.sharpnessDrop.min) return 'weak'
    if (drop > GUARD_BANDS.sharpnessDrop.max) return 'strong'
    return 'ok'
  },
  explain() {
    return '失焦或手震，主體邊緣糊掉了，細節看不清楚'
  },
}
