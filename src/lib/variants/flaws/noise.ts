// noise（noise）：Box-Muller 亮度雜訊 σ，外加 30% 的獨立色度雜訊。
// 雜訊圖樣由 plan 抽出的 noiseSeed 決定，重做時圖樣一致、只改幅度。
import { FLAWS } from '../registry'
import { cloneRaster, gaussian, rng } from '../util'
import { num, round, type FlawImpl } from './common'

export const noiseFlaw: FlawImpl = {
  id: 'noise',
  guard(report) {
    return report.metrics.noise.score >= 70 && report.metrics.negativeSpace.raw.emptyFraction >= 0.15
  },
  plan(r, difficulty) {
    const t = FLAWS.noise.tiers[difficulty]
    const sigma = round(t.sigma * (1 + (r() - 0.5) * 0.2), 1)
    const noiseSeed = Math.floor(r() * 4294967296)
    return { sigma, chroma: t.chroma, noiseSeed }
  },
  render(params, strength, ctx) {
    const sigma = round(num(params, 'sigma') * strength, 1)
    const chroma = num(params, 'chroma') * sigma
    const g = rng(num(params, 'noiseSeed'))
    const out = cloneRaster(ctx.src)
    const d = out.data
    for (let p = 0; p < d.length; p += 4) {
      const n = gaussian(g) * sigma
      d[p] = d[p] + n + gaussian(g) * chroma
      d[p + 1] = d[p + 1] + n + gaussian(g) * chroma
      d[p + 2] = d[p + 2] + n + gaussian(g) * chroma
    }
    return { raster: out, cropApplied: null, params: { sigma } }
  },
  explain() {
    return '雜訊顆粒明顯，平面和暗部佈滿沙點，像高 ISO 硬拍的'
  },
}
