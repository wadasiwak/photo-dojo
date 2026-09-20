import { describe, expect, it } from 'vitest'
import { toGray } from '../../raster'
import { exposure } from '../exposure'
import { flat, gradient, tiltedLine } from './synth'

const run = (r: ReturnType<typeof flat>) => exposure(toGray(r), r.w, r.h)

describe('exposure', () => {
  it('flat(250) clipHigh≈100%、score<20、有 exposure hint', () => {
    const m = run(flat(320, 240, 250))
    expect(m.raw.clipHigh).toBeGreaterThan(99)
    expect(m.score).toBeLessThan(20)
    expect(m.hints.some((h) => h.principle === 'exposure' && h.severity === 'warn')).toBe(true)
  })
  it('flat(128) ≥95 無 hint', () => {
    const m = run(flat(320, 240, 128))
    expect(m.score).toBeGreaterThanOrEqual(95)
    expect(m.hints.filter((h) => h.principle === 'exposure')).toHaveLength(0)
    expect(m.confidence).toBe(1)
  })
  it('gradient DR≥95、無 dynamic-range hint', () => {
    const m = run(gradient(320, 240, 'h'))
    expect(m.raw.dynamicRange).toBeGreaterThanOrEqual(95)
    expect(m.raw.drScore).toBeGreaterThanOrEqual(95)
    expect(m.hints.some((h) => h.principle === 'dynamic-range')).toBe(false)
  })
  it('雙色剪影 confidence ≤ 0.6', () => {
    const m = run(tiltedLine(320, 240, 0, 1, [230, 230, 230], [20, 20, 20]))
    expect(m.confidence).toBeLessThanOrEqual(0.6)
  })
  it('低對比灰圖給 dynamic-range info', () => {
    const m = run(flat(64, 64, 120))
    expect(m.hints.some((h) => h.principle === 'dynamic-range' && h.severity === 'info')).toBe(true)
  })
})
