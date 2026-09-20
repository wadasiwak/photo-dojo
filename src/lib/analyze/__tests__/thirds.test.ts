import { describe, expect, it } from 'vitest'
import { sobel, toGray } from '../../raster'
import type { Raster } from '../../raster'
import { saliency } from '../saliency'
import { symmetry } from '../symmetry'
import { thirds } from '../thirds'
import { disc, flat, paintDisc } from './synth'

const run = (r: Raster) => {
  const g = toGray(r)
  const sal = saliency(sobel(g, r.w, r.h), r)
  return thirds(sal, symmetry(g, r.w, r.h).score)
}

describe('thirds', () => {
  it('disc 在三分點 ≥95', () => {
    const m = run(disc(320, 240, 1 / 3, 1 / 3, 0.1, [220, 40, 40], 128))
    expect(m.score).toBeGreaterThanOrEqual(95)
    expect(m.confidence).toBeGreaterThan(0.5)
  })
  it('置中非對稱 ≤50', () => {
    // 四象限異色的置中圓：色彩能量對稱（質心居中）但灰度左右/上下皆不對稱
    const r = flat(320, 240, 128)
    const cx = 0.5, cy = 0.5, rad = 0.15
    paintDisc(r, cx, cy, rad, [255, 0, 0])
    const quads: [number, number, [number, number, number]][] = [[1, 0, [0, 0, 255]], [0, 1, [0, 255, 0]], [1, 1, [255, 0, 255]]]
    for (const [qx, qy, rgb] of quads) {
      for (let y = 0; y < 240; y++) for (let x = 0; x < 320; x++) {
        const inQ = (x >= 160) === (qx === 1) && (y >= 120) === (qy === 1)
        const o = (y * 320 + x) * 4
        if (inQ && r.data[o] === 255 && r.data[o + 1] === 0 && r.data[o + 2] === 0) { r.data[o] = rgb[0]; r.data[o + 1] = rgb[1]; r.data[o + 2] = rgb[2] }
      }
    }
    const m = run(r)
    expect(m.raw.dCenter).toBeLessThan(0.06)
    expect(m.score).toBeLessThanOrEqual(50)
  })
  it('置中對稱 ≥70', () => {
    const m = run(disc(320, 240, 0.5, 0.5, 0.15, [220, 40, 40], 128))
    expect(m.raw.dCenter).toBeLessThan(0.06)
    expect(m.score).toBeGreaterThanOrEqual(70)
  })
  it('觸邊有 subject-placement warn', () => {
    const m = run(disc(320, 240, 0.05, 0.5, 0.08, [220, 40, 40], 128))
    expect(m.hints.some((h) => h.principle === 'subject-placement' && h.severity === 'warn')).toBe(true)
  })
})
