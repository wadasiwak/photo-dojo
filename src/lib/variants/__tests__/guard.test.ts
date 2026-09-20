import { describe, expect, it } from 'vitest'
import { makeVariant } from '../index'
import { localMeasure } from '../measure'
import type { Measure } from '../types'
import { fakeReport } from './fakeReport'
import { checker, gradient, tiltedLine } from './synth'

describe('反卡通守門', () => {
  const report = fakeReport()

  it('blur：量測回報掉幅超帶 → 半徑 ×0.75 重做一次', () => {
    const src = checker(400, 300, 8)
    let calls = 0
    const measure: Measure = { ...localMeasure, sharpness: () => (calls++ === 0 ? 100 : 10) } // 源 100、套後 10 → 掉 90
    const v = makeVariant(src, 'blur', 'g1', 'medium', report, { measure })
    const plain = makeVariant(src, 'blur', 'g1', 'medium', report, { measure: { ...localMeasure, sharpness: () => (calls++ % 2 === 0 ? 100 : 60) } })
    expect(v.params.verdict).toBe('strong')
    expect(v.params.attempts).toBe(2)
    expect(v.params.strength).toBe(0.75)
    expect(v.params.radius).toBeCloseTo((plain.params.radius as number) * 0.75, 1)
    expect(v.difficulty).toBe('medium')
  })

  it('exposure：裁切增量不足 → 升一級難度重做', () => {
    const src = gradient(200, 150)
    const measure: Measure = { ...localMeasure, clipHigh: () => 0 }
    const v = makeVariant(src, 'overexpose', 'g2', 'hard', report, { measure })
    expect(v.params.verdict).toBe('weak')
    expect(v.difficulty).toBe('medium')
    expect(v.params.attempts).toBe(2)
    // 已是 easy 就不再升
    const e = makeVariant(src, 'overexpose', 'g2', 'easy', report, { measure })
    expect(e.difficulty).toBe('easy')
    expect(e.params.attempts).toBe(1)
  })

  it('tilt：量到的角度偏離設定 >1° → ×0.75', () => {
    const src = tiltedLine(300, 200, 0, [200, 200, 200], [50, 50, 50])
    const measure: Measure = { ...localMeasure, tilt: () => 0 }
    const v = makeVariant(src, 'tilt', 'g3', 'medium', report, { measure })
    expect(v.params.strength).toBe(0.75)
    const ok = makeVariant(src, 'tilt', 'g3', 'medium', report)
    expect(ok.params.strength).toBe(1)
    expect(Math.abs(v.params.deg as number)).toBeCloseTo(Math.abs(ok.params.deg as number) * 0.75, 1)
  })

  it('絕不疊加兩種壞法：結果只有一個 flawId 且 params 不含他種鍵', () => {
    const v = makeVariant(gradient(100, 80), 'noise', 'g4', 'easy', report)
    expect(v.flawId).toBe('noise')
    expect(v.params).not.toHaveProperty('deg')
    expect(v.params).not.toHaveProperty('gamma')
  })
})
