import { describe, expect, it } from 'vitest'
import { makeVariant } from '../index'
import { localMeasure } from '../measure'
import { FLAWS } from '../registry'
import { fakeReport } from './fakeReport'
import { countColor, tiltedLine } from './synth'

const MAGENTA = [255, 0, 255] as const

describe('tilt', () => {
  const src = tiltedLine(400, 300, 0, [120, 170, 230], [70, 110, 50])
  const report = fakeReport()

  it('量測器本身：tiltedLine(±4) 量得 ≈ ±4', () => {
    expect(localMeasure.tilt(tiltedLine(400, 300, 4, [200, 200, 200], [40, 40, 40]))).toBeCloseTo(4, 0)
    expect(localMeasure.tilt(tiltedLine(400, 300, -6, [200, 200, 200], [40, 40, 40]))).toBeCloseTo(-6, 0)
    expect(Math.abs(localMeasure.tilt(src))).toBeLessThan(0.5)
  })

  it('三難度區間、量測 ≈ θ±0.8、尺寸不變、無黑角、cropApplied 在界內', () => {
    for (const d of ['hard', 'medium', 'easy'] as const) {
      const tier = FLAWS.tilt.tiers[d]
      for (let s = 0; s < 4; s++) {
        const v = makeVariant(src, 'tilt', `t${s}`, d, report, { fill: MAGENTA })
        const deg = v.params.deg as number
        expect(Math.abs(deg)).toBeGreaterThanOrEqual(tier.min - 1e-9)
        expect(Math.abs(deg)).toBeLessThanOrEqual(tier.max + 1e-9)
        expect(v.raster.w).toBe(400)
        expect(v.raster.h).toBe(300)
        expect(countColor(v.raster, MAGENTA)).toBe(0)
        const measured = localMeasure.tilt(v.raster)
        expect(Math.abs(measured - deg), `${d} seed ${s}: deg=${deg} measured=${measured}`).toBeLessThan(0.8)
        const c = v.cropApplied!
        expect(c).not.toBeNull()
        expect(c.x).toBeGreaterThanOrEqual(0)
        expect(c.y).toBeGreaterThanOrEqual(0)
        expect(c.x + c.w).toBeLessThanOrEqual(400)
        expect(c.y + c.h).toBeLessThanOrEqual(300)
        expect(c.w).toBeLessThan(400)
        expect(v.params.attempts).toBe(1)
      }
    }
  })

  it('正負號都會出現', () => {
    const signs = new Set<number>()
    for (let s = 0; s < 12; s++) signs.add(Math.sign(makeVariant(src, 'tilt', s, 'medium', report).params.deg as number))
    expect(signs.size).toBe(2)
  })
})
