import { describe, expect, it } from 'vitest'
import { toGray } from '../../raster'
import type { Raster } from '../../raster'
import { noise } from '../noise'
import { addGaussianNoise, checker, flat } from './synth'

const run = (r: Raster) => noise(toGray(r), r.w, r.h)

describe('noise', () => {
  it('flat(128)+σ8 → 量測 8±2、score<30、有 warn', () => {
    const m = run(addGaussianNoise(flat(480, 320, 128), 8, 11))
    expect(Math.abs(m.raw.noiseSigma - 8)).toBeLessThanOrEqual(2)
    expect(m.score).toBeLessThan(30)
    expect(m.hints.some((h) => h.principle === 'noise' && h.severity === 'warn')).toBe(true)
    expect(m.confidence).toBe(0.7)
  })
  it('flat ≥95', () => {
    const m = run(flat(480, 320, 128))
    expect(m.score).toBeGreaterThanOrEqual(95)
    expect(m.hints).toHaveLength(0)
  })
  it('滿版棋盤無平坦格 → conf 0.3', () => {
    const m = run(checker(480, 320, 6))
    expect(m.raw.flatCells).toBeLessThan(6)
    expect(m.confidence).toBe(0.3)
  })
})
