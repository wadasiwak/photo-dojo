import { describe, expect, it } from 'vitest'
import { sobel, toGray } from '../../raster'
import { saliency } from '../saliency'
import { checker, disc, flat } from './synth'
import type { Raster } from '../../raster'

const run = (r: Raster) => saliency(sobel(toGray(r), r.w, r.h), r)

describe('saliency', () => {
  it('disc(0.33,0.33) 質心誤差 <0.03、bbox 含 disc', () => {
    const r = disc(320, 240, 0.33, 0.33, 0.1, [220, 40, 40], 128)
    const s = run(r)
    expect(Math.abs(s.cx - 0.33)).toBeLessThan(0.03)
    expect(Math.abs(s.cy - 0.33)).toBeLessThan(0.03)
    const rx = (0.1 * 240) / 320, ry = 0.1
    // bbox 為 5–95 百分位，允許縫進 disc 邊緣 30%
    expect(s.bbox.x0).toBeLessThanOrEqual(0.33 - rx * 0.7)
    expect(s.bbox.x1).toBeGreaterThanOrEqual(0.33 + rx * 0.7)
    expect(s.bbox.y0).toBeLessThanOrEqual(0.33 - ry * 0.7)
    expect(s.bbox.y1).toBeGreaterThanOrEqual(0.33 + ry * 0.7)
    expect(s.mass).toBeGreaterThan(3)
  })
  it('flat mass≈1、質心在中央', () => {
    const s = run(flat(320, 240, 100))
    expect(s.mass).toBeCloseTo(1, 2)
    expect(s.cx).toBeCloseTo(0.5, 2)
    expect(s.cy).toBeCloseTo(0.5, 2)
  })
  it('滿版紋理 質心≈中心、mass 低', () => {
    const s = run(checker(320, 240, 8))
    expect(Math.abs(s.cx - 0.5)).toBeLessThan(0.05)
    expect(Math.abs(s.cy - 0.5)).toBeLessThan(0.05)
    expect(s.mass).toBeLessThan(1.6)
  })
})
