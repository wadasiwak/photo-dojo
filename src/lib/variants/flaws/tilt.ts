// tilt（horizon-level）：rotateCrop θ 再縮回原尺寸。θ 區間見 registry；正負號各半。
import { FLAWS, GUARD_BANDS } from '../registry'
import { rotateCrop } from '../util'
import { num, round, uniform, type FlawImpl } from './common'

export const tiltFlaw: FlawImpl = {
  id: 'tilt',
  guard(report) {
    const h = report.metrics.horizon
    // 源圖本身已明顯歪（且量測有把握）就別再歪
    return !(Math.abs(h.raw.tilt) > 1.5 && h.confidence > 0.5)
  },
  plan(r, difficulty) {
    const t = FLAWS.tilt.tiers[difficulty]
    const mag = uniform(r, t.min, t.max)
    const sign = r() < 0.5 ? -1 : 1
    return { deg: sign * mag }
  },
  render(params, strength, ctx) {
    const deg = round(num(params, 'deg') * strength)
    const { raster, crop } = rotateCrop(ctx.src, deg, ctx.fill)
    return { raster, cropApplied: crop, params: { deg } }
  },
  check(out, params, strength, ctx) {
    const deg = num(params, 'deg') * strength
    const delta = ctx.measure.tilt(out) - ctx.measure.tilt(ctx.src)
    return Math.abs(delta - deg) <= GUARD_BANDS.tiltTolerance ? 'ok' : 'strong'
  },
  explain(params) {
    const deg = Math.abs(num(params, 'deg'))
    return `地平線歪了約 ${deg.toFixed(0)}°——水平線一歪，整張就不安穩`
  },
}
