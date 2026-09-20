import { describe, expect, it } from 'vitest'
import { sobel, toGray } from '../../raster'
import type { Raster } from '../../raster'
import { leadingLines } from '../leadingLines'
import { saliency } from '../saliency'
import { checker, disc, drawLine, flat, randomGray } from './synth'

const run = (r: Raster) => {
  const e = sobel(toGray(r), r.w, r.h)
  return leadingLines(e, r.w, r.h, saliency(e, r))
}

describe('leadingLines', () => {
  it('兩條匝聚於 disc 的線 lineCount≥2 且 convergent', () => {
    // 兩條線在 disc 中心交叉（X 形）：線條本身也有邊緣能量，若只從一側匝入會把 saliency 質心拉離主體
    const r = disc(320, 240, 0.5, 0.4, 0.1, [255, 40, 40], 128)
    drawLine(r, 0, 0.8, 1, 0.0, 2, [70, 70, 70])
    drawLine(r, 0, 0.0, 1, 0.8, 2, [70, 70, 70])
    const m = run(r)
    expect(m.raw.lineCount).toBe(2)
    expect(m.raw.convergent).toBe(1)
    expect(m.score).toBeGreaterThanOrEqual(85)
  })
  it('flat → 0 線', () => {
    const m = run(flat(320, 240, 128))
    expect(m.raw.lineCount).toBe(0)
    expect(m.raw.convergent).toBe(0)
  })
  it('永不 warn', () => {
    for (const r of [flat(320, 240, 128), checker(320, 240, 16), randomGray(320, 240, 5), disc(320, 240, 0.5, 0.5, 0.2, [255, 255, 255], 0)]) {
      expect(run(r).hints.every((h) => h.severity === 'info')).toBe(true)
    }
  })
})
