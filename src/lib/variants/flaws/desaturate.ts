// desaturate（saturation）：以亮度為軸把色彩往灰收（保亮度），再加 lift 模擬手機平淡感。
// out = Y + k·(in − Y) + lift
import { FLAWS } from '../registry'
import { cloneRaster, luma } from '../util'
import { num, round, type FlawImpl } from './common'

export const desaturateFlaw: FlawImpl = {
  id: 'desaturate',
  guard(report) {
    return report.metrics.colorHarmony.raw.meanSat >= 0.25
  },
  plan(r, difficulty) {
    const t = FLAWS.desaturate.tiers[difficulty]
    const k = round(t.k * (1 + (r() - 0.5) * 0.1), 3)
    return { k, lift: t.lift }
  },
  render(params, strength, ctx) {
    const k = round(1 - (1 - num(params, 'k')) * strength, 3)
    const lift = round(num(params, 'lift') * strength, 1)
    const out = cloneRaster(ctx.src)
    const d = out.data
    for (let p = 0; p < d.length; p += 4) {
      const y = luma(d[p], d[p + 1], d[p + 2])
      d[p] = y + k * (d[p] - y) + lift
      d[p + 1] = y + k * (d[p + 1] - y) + lift
      d[p + 2] = y + k * (d[p + 2] - y) + lift
    }
    return { raster: out, cropApplied: null, params: { k, lift } }
  },
  explain(params) {
    return num(params, 'k') < 0.1
      ? '顏色幾乎被抽光，整張灰灰平平，少了原本的氛圍'
      : '顏色被收掉大半，畫面顯得平淡沒精神'
  },
}
