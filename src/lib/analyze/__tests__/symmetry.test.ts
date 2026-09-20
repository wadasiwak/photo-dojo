import { describe, expect, it } from 'vitest'
import { toGray } from '../../raster'
import type { Raster } from '../../raster'
import { symmetry } from '../symmetry'
import { mirrorGradient, randomGray } from './synth'

const run = (r: Raster) => symmetry(toGray(r), r.w, r.h)

describe('symmetry', () => {
  it('鏡像漸層 ≥0.9，有 info、無 warn', () => {
    const m = run(mirrorGradient(320, 240))
    expect(m.raw.symmetry).toBeGreaterThanOrEqual(0.9)
    expect(m.score).toBeGreaterThanOrEqual(90)
    expect(m.hints.some((h) => h.principle === 'symmetry' && h.severity === 'info')).toBe(true)
    expect(m.hints.every((h) => h.severity === 'info')).toBe(true)
  })
  it('隨機 <0.4', () => {
    const m = run(randomGray(320, 240, 9))
    expect(m.raw.symmetry).toBeLessThan(0.4)
    expect(m.hints).toHaveLength(0)
  })
})
