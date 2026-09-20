import { describe, expect, it } from 'vitest'
import { sobel, toGray } from '../../raster'
import type { Raster } from '../../raster'
import { negativeSpace } from '../negativeSpace'
import { checker, disc } from './synth'

const run = (r: Raster) => negativeSpace(sobel(toGray(r), r.w, r.h).mag, r.w, r.h)

describe('negativeSpace', () => {
  it('flat + 小 disc emptyFraction>0.8，正向 info', () => {
    const m = run(disc(320, 240, 0.3, 0.3, 0.08, [220, 40, 40], 128))
    expect(m.raw.emptyFraction).toBeGreaterThan(0.8)
    expect(m.raw.emptyContiguity).toBeGreaterThan(0.4)
    expect(m.hints.some((h) => h.principle === 'negative-space' && h.severity === 'info')).toBe(true)
    expect(m.score).toBeGreaterThanOrEqual(70)
  })
  it('checker(4) <0.1 且有 hint', () => {
    const m = run(checker(320, 240, 4))
    expect(m.raw.emptyFraction).toBeLessThan(0.1)
    expect(m.hints.some((h) => h.principle === 'negative-space')).toBe(true)
  })
})
