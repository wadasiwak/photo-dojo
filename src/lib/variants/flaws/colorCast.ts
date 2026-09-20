// colorCast（white-balance）：整張加固定通道偏移（暖/冷/綠/洋紅），並扣掉亮度變化保持平均亮度。
import { FLAWS } from '../registry'
import { cloneRaster, luma } from '../util'
import { num, round, type FlawImpl } from './common'

export type CastDirection = 'warm' | 'cool' | 'green' | 'magenta'
const DIRECTIONS: readonly CastDirection[] = ['warm', 'cool', 'green', 'magenta']
const DIRECTION_WORD: Record<CastDirection, string> = { warm: '暖黃', cool: '冷藍', green: '綠', magenta: '洋紅' }

/** 各方向的通道偏移（單位倍率 m） */
export function castDelta(dir: CastDirection, m: number): [number, number, number] {
  switch (dir) {
    case 'warm':
      return [m, 0, -m]
    case 'cool':
      return [-m, 0, m]
    case 'green':
      return [-m / 2, m, -m / 2]
    case 'magenta':
      return [m / 2, -m, m / 2]
  }
}

export const colorCastFlaw: FlawImpl = {
  id: 'colorCast',
  guard(report) {
    const c = report.metrics.colorHarmony.raw
    return c.castMagnitude < 12 && c.neutralShare >= 0.15
  },
  plan(r, difficulty) {
    const t = FLAWS.colorCast.tiers[difficulty]
    const direction = DIRECTIONS[Math.floor(r() * DIRECTIONS.length)]
    const magnitude = round(t.magnitude + (r() - 0.5) * 4, 1)
    return { direction, magnitude }
  },
  render(params, strength, ctx) {
    const m = round(num(params, 'magnitude') * strength, 1)
    const [dr, dg, db] = castDelta(params.direction as CastDirection, m)
    const dy = luma(dr, dg, db) // 保亮度：把偏移造成的亮度變化扣回
    const out = cloneRaster(ctx.src)
    const d = out.data
    for (let p = 0; p < d.length; p += 4) {
      d[p] = d[p] + dr - dy
      d[p + 1] = d[p + 1] + dg - dy
      d[p + 2] = d[p + 2] + db - dy
    }
    return { raster: out, cropApplied: null, params: { magnitude: m } }
  },
  explain(params) {
    const word = DIRECTION_WORD[params.direction as CastDirection]
    return `整張偏${word}，白的東西不再是白的，膚色和天空也跟著跑掉`
  },
}
