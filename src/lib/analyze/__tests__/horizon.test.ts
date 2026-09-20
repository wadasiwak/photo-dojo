import { describe, expect, it } from 'vitest'
import { sobel, toGray } from '../../raster'
import type { Raster } from '../../raster'
import { horizon } from '../horizon'
import { checker, randomGray, stripes, tiltedLine } from './synth'

const run = (r: Raster) => horizon(sobel(toGray(r), r.w, r.h), r.w, r.h)

describe('horizon', () => {
  for (const deg of [0, 1.5, -1.5, 4, -4, 8]) {
    it(`tiltedLine ${deg}° → |tilt−deg|<0.6 且 conf>0.7`, () => {
      const m = run(tiltedLine(320, 213, deg, 1.5, [180, 200, 230], [90, 120, 60]))
      expect(Math.abs(m.raw.tilt - deg)).toBeLessThan(0.6)
      expect(m.confidence).toBeGreaterThan(0.7)
      if (Math.abs(deg) > 2) expect(m.hints.some((h) => h.principle === 'horizon-level' && h.severity === 'warn')).toBe(true)
      else expect(m.hints).toHaveLength(0)
    })
  }
  it('stripes 45° / checker / 噪聲 conf<0.3', () => {
    expect(run(stripes(320, 240, 45, 16)).confidence).toBeLessThan(0.3)
    expect(run(checker(320, 240, 8)).confidence).toBeLessThan(0.3)
    expect(run(randomGray(320, 240, 7)).confidence).toBeLessThan(0.3)
  })
})
