import { describe, expect, it } from 'vitest'
import { eligibleFlaws, makeVariant } from '../index'
import { localMeasure } from '../measure'
import { castVector, meanLuma } from '../util'
import { fakeReport } from './fakeReport'
import { disc, flat } from './synth'

describe('desaturate', () => {
  // 彩色圓盤在彩色背景，源 meanSat 高
  const src = disc(320, 240, 0.4, 0.5, 0.2, [230, 80, 50], [40, 120, 200])
  const report = fakeReport()

  it('meanSat 降 ≥0.15、easy <0.05、亮度變化 = lift ±3', () => {
    const s0 = localMeasure.meanSat(src)
    const l0 = meanLuma(src)
    expect(s0).toBeGreaterThan(0.5)
    for (const d of ['hard', 'medium', 'easy'] as const) {
      const v = makeVariant(src, 'desaturate', 'd1', d, report)
      const s1 = localMeasure.meanSat(v.raster)
      expect(s0 - s1, d).toBeGreaterThanOrEqual(0.15)
      if (d === 'easy') expect(s1).toBeLessThan(0.05)
      const lift = v.params.lift as number
      expect(Math.abs(meanLuma(v.raster) - l0 - lift), d).toBeLessThanOrEqual(3)
    }
  })

  it('守門：meanSat<0.25 不合格', () => {
    expect(eligibleFlaws([], fakeReport({ meanSat: 0.1 }))).not.toContain('desaturate')
  })
})

describe('colorCast', () => {
  const src = flat(200, 150, [128, 128, 128])
  const report = fakeReport()

  it('幅度 ≥15、方向正確、亮度 ±3', () => {
    const seen = new Set<string>()
    for (let s = 0; s < 16; s++) {
      const v = makeVariant(src, 'colorCast', `cc${s}`, 'hard', report)
      const dir = v.params.direction as string
      seen.add(dir)
      const c = castVector(v.raster)
      expect(c.magnitude, dir).toBeGreaterThanOrEqual(15)
      if (dir === 'warm') expect(c.castR > 0 && c.castB < 0).toBe(true)
      if (dir === 'cool') expect(c.castR < 0 && c.castB > 0).toBe(true)
      if (dir === 'green') expect(c.castR < 0 && c.castB < 0).toBe(true)
      if (dir === 'magenta') expect(c.castR > 0 && c.castB > 0).toBe(true)
      expect(Math.abs(meanLuma(v.raster) - 128)).toBeLessThanOrEqual(3)
      expect(localMeasure.castMagnitude(v.raster)).toBeGreaterThanOrEqual(15)
    }
    expect(seen.size).toBe(4)
  })

  it('守門：源圖已有色偏或中性像素太少不合格', () => {
    expect(eligibleFlaws([], fakeReport({ castMagnitude: 20 }))).not.toContain('colorCast')
    expect(eligibleFlaws([], fakeReport({ neutralShare: 0.05 }))).not.toContain('colorCast')
    expect(eligibleFlaws([], fakeReport())).toContain('colorCast')
  })
})
