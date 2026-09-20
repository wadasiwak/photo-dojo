import { describe, expect, it } from 'vitest'
import { eligibleFlaws, makeVariant } from '../index'
import { localMeasure } from '../measure'
import { fakeReport } from './fakeReport'
import { disc, flat } from './synth'

describe('cropSubject', () => {
  // 圓盤在三分點
  const src = disc(320, 240, 0.33, 0.33, 0.04, [220, 60, 40], [200, 210, 220])

  it('量測器：圓盤質心與 bbox 正確、flat 的 mass≈1', () => {
    const s = localMeasure.saliency(src)
    expect(Math.abs(s.cx - 0.33)).toBeLessThan(0.03)
    expect(Math.abs(s.cy - 0.33)).toBeLessThan(0.03)
    expect(s.bbox.x0).toBeLessThan(0.33)
    expect(s.bbox.x1).toBeGreaterThan(0.33)
    expect(s.mass).toBeGreaterThan(2)
    expect(localMeasure.saliency(flat(64, 48, [100, 100, 100])).mass).toBeCloseTo(1, 5)
  })

  it('hard：質心 edgeDist < 0.08（沒給 report 時自行量 saliency）', () => {
    for (let s = 0; s < 4; s++) {
      const v = makeVariant(src, 'cropSubject', `c${s}`, 'hard')
      const sal = localMeasure.saliency(v.raster)
      const edgeDist = Math.min(sal.cx, 1 - sal.cx, sal.cy, 1 - sal.cy)
      // 量測精度約 1px/320 ≈ 0.003，容 0.005
      expect(edgeDist, `seed ${s} edge=${v.params.edge}`).toBeLessThan(0.085)
      expect(v.cropApplied).toBeNull()
      expect(v.raster.w).toBe(320)
    }
  })

  it('easy：bbox 觸邊（主體被切）', () => {
    for (let s = 0; s < 4; s++) {
      const v = makeVariant(src, 'cropSubject', `c${s}`, 'easy')
      const b = localMeasure.saliency(v.raster).bbox
      const touches = Math.min(b.x0, b.y0, 1 - b.x1, 1 - b.y1) < 0.03
      expect(touches, `seed ${s} edge=${v.params.edge} bbox=${JSON.stringify(b)}`).toBe(true)
    }
  })

  it('flat（mass≈1）不合格；bbox 過大不合格', () => {
    expect(eligibleFlaws([], fakeReport({ saliency: { mass: 1 } }))).not.toContain('cropSubject')
    expect(eligibleFlaws([], fakeReport({ saliency: { bbox: { x0: 0.1, y0: 0.1, x1: 0.9, y1: 0.9 } } }))).not.toContain('cropSubject')
    expect(eligibleFlaws([], fakeReport())).toContain('cropSubject')
  })
})

describe('centerCrop', () => {
  const src = disc(320, 240, 0.33, 0.33, 0.04, [220, 60, 40], [200, 210, 220])

  it('質心距中心 < 0.04（各難度）', () => {
    for (const d of ['hard', 'medium', 'easy'] as const) {
      const v = makeVariant(src, 'centerCrop', 'cc', d, fakeReport())
      const s = localMeasure.saliency(v.raster)
      expect(Math.hypot(s.cx - 0.5, s.cy - 0.5), d).toBeLessThan(0.04)
      expect(v.raster.w).toBe(320)
    }
  })

  it('守門：dThirds≥0.12 或對稱圖不合格', () => {
    expect(eligibleFlaws([], fakeReport({ dThirds: 0.2 }))).not.toContain('centerCrop')
    expect(eligibleFlaws([], fakeReport({ symmetryScore: 80 }))).not.toContain('centerCrop')
    expect(eligibleFlaws([], fakeReport())).toContain('centerCrop')
  })
})
