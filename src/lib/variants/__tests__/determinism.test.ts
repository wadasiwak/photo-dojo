import { describe, expect, it } from 'vitest'
import { FLAW_IDS, makeVariant } from '../index'
import { fakeReport } from './fakeReport'
import { bytesEqual, disc } from './synth'

describe('確定性', () => {
  const src = disc(320, 240, 0.33, 0.33, 0.08, [200, 60, 40], [90, 120, 160])
  const report = fakeReport()

  it('同 seed 位元組相同', () => {
    for (const id of FLAW_IDS) {
      const a = makeVariant(src, id, 'img:1', 'medium', report)
      const b = makeVariant(src, id, 'img:1', 'medium', report)
      expect(bytesEqual(a.raster, b.raster), id).toBe(true)
      expect(a.params, id).toEqual(b.params)
    }
  })

  it('seed 不同則 params 不同（tilt/noise/blur/exposure）', () => {
    for (const id of ['tilt', 'noise', 'blur', 'overexpose', 'colorCast'] as const) {
      const a = makeVariant(src, id, 'seed-a', 'medium', report)
      const b = makeVariant(src, id, 'seed-b', 'medium', report)
      expect(a.params, id).not.toEqual(b.params)
    }
  })

  it('每個結果都有中性的中文解析、原則與難度', () => {
    for (const id of FLAW_IDS) {
      const v = makeVariant(src, id, 7, 'easy', report)
      expect(v.flawId).toBe(id)
      expect(v.explain.length).toBeGreaterThan(8)
      expect(v.explain).not.toMatch(/左邊|右邊/)
      expect(v.raster.w).toBe(src.w)
      expect(v.raster.h).toBe(src.h)
    }
  })
})
