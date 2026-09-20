import { describe, expect, it } from 'vitest'
import { makeVariant } from '../index'
import { localMeasure } from '../measure'
import { meanLuma } from '../util'
import { fakeReport } from './fakeReport'
import { gradient } from './synth'

describe('overexpose / underexpose', () => {
  const src = gradient(320, 240, 'x')
  const report = fakeReport()

  it('overexpose：clipHigh +5pt 以上且 ≤60%，亮度隨難度單調上升', () => {
    const base = localMeasure.clipHigh(src)
    let prev = -1
    for (const d of ['hard', 'medium', 'easy'] as const) {
      const v = makeVariant(src, 'overexpose', 'e1', d, report)
      const clip = localMeasure.clipHigh(v.raster)
      expect(clip - base, d).toBeGreaterThanOrEqual(5)
      expect(clip, d).toBeLessThanOrEqual(60)
      const lum = meanLuma(v.raster)
      expect(lum, d).toBeGreaterThan(prev)
      expect(lum).toBeGreaterThan(meanLuma(src))
      prev = lum
    }
  })

  it('underexpose：clipLow +5pt 以上且 ≤60%，亮度隨難度單調下降', () => {
    const base = localMeasure.clipLow(src)
    let prev = 999
    for (const d of ['hard', 'medium', 'easy'] as const) {
      const v = makeVariant(src, 'underexpose', 'e1', d, report)
      const clip = localMeasure.clipLow(v.raster)
      expect(clip - base, d).toBeGreaterThanOrEqual(5)
      expect(clip, d).toBeLessThanOrEqual(60)
      const lum = meanLuma(v.raster)
      expect(lum, d).toBeLessThan(prev)
      prev = lum
    }
  })

  it('解析含量到的百分比', () => {
    const v = makeVariant(src, 'overexpose', 'e2', 'easy', report)
    expect(v.explain).toMatch(/亮部約 \d+% 接近純白/)
  })
})
