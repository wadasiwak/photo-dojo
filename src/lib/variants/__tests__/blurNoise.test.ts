import { describe, expect, it } from 'vitest'
import { eligibleFlaws, makeVariant } from '../index'
import { localMeasure } from '../measure'
import { fakeReport } from './fakeReport'
import { boxBlurRaster } from '../util'
import { addGaussianNoise, checker, flat } from './synth'

describe('blur', () => {
  // 稍微軟化的棋盤：硬邊棋盤遠超清晰度分數表的飽和點，量不到掉幅
  const src = boxBlurRaster(checker(800, 600, 48), 2, 1)
  const report = fakeReport()

  it('清晰度掉 ≥25，hard 掉幅 < easy', () => {
    const base = localMeasure.sharpness(src)
    expect(base).toBeGreaterThanOrEqual(60)
    const hard = makeVariant(src, 'blur', 'b1', 'hard', report)
    const easy = makeVariant(src, 'blur', 'b1', 'easy', report)
    const dropHard = base - localMeasure.sharpness(hard.raster)
    const dropEasy = base - localMeasure.sharpness(easy.raster)
    expect(dropHard).toBeGreaterThanOrEqual(25)
    expect(dropEasy).toBeGreaterThanOrEqual(25)
    expect(dropHard).toBeLessThan(dropEasy)
  })

  it('守門：源圖清晰度 <60 不合格', () => {
    expect(eligibleFlaws([], fakeReport({ sharpnessScore: 40 }))).not.toContain('blur')
  })
})

describe('noise', () => {
  const src = flat(320, 240, [128, 128, 128])
  const report = fakeReport()

  it('量測器：flat+σ8 量得 8±2、flat 量得 ≈0', () => {
    expect(Math.abs(localMeasure.noiseSigma(addGaussianNoise(src, 8, 1)) - 8)).toBeLessThan(2)
    expect(localMeasure.noiseSigma(src)).toBeLessThan(0.5)
  })

  it('量到的 σ 在設定值 ±30% 內', () => {
    for (const d of ['hard', 'medium', 'easy'] as const) {
      const v = makeVariant(src, 'noise', 'n1', d, report)
      const sigma = v.params.sigma as number
      const measured = localMeasure.noiseSigma(v.raster)
      expect(Math.abs(measured - sigma) / sigma, `${d} sigma=${sigma} measured=${measured}`).toBeLessThan(0.3)
    }
  })

  it('checker（畫面滿、無平坦區）不合格', () => {
    expect(eligibleFlaws([], fakeReport({ emptyFraction: 0.05 }))).not.toContain('noise')
    expect(eligibleFlaws([], fakeReport({ noiseScore: 50 }))).not.toContain('noise')
  })
})
