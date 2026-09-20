import { describe, expect, it } from 'vitest'
import { toGray } from '../../raster'
import type { Raster } from '../../raster'
import { sharpness } from '../sharpness'
import { checker, flat, gaussianBlurRef } from './synth'

const run = (r: Raster) => sharpness(toGray(r), r.w, r.h)

describe('sharpness', () => {
  it('checker vs gaussianBlurRef σ3 差 ≥40，模糊版有 warn', () => {
    // 設計稿寫 checker(8)，但 8px 週期經 σ3 模糊後 Laplacian/std 比值仍高（純高頻訊號正規化後不變），
    // 故改用 48px 格讓「模糊 = 邊緣變緩」真的反映在指標上。
    const sharp = checker(480, 320, 48)
    const a = run(sharp)
    const b = run(gaussianBlurRef(sharp, 3))
    expect(a.score - b.score).toBeGreaterThanOrEqual(40)
    expect(a.confidence).toBeGreaterThan(0.5)
    expect(b.hints.some((h) => h.principle === 'sharpness' && h.severity === 'warn')).toBe(true)
    expect(a.hints).toHaveLength(0)
  })
  it('flat conf<0.3', () => {
    expect(run(flat(480, 320, 128)).confidence).toBeLessThan(0.3)
  })
})
