import { describe, expect, it } from 'vitest'
import { colorHarmony } from '../colorHarmony'
import { blocks, flat, randomGray } from './synth'

describe('colorHarmony', () => {
  it('半紅半青 互補 ≥85', () => {
    const m = colorHarmony(blocks(320, 240, [[220, 40, 40], [40, 220, 220]]))
    expect(m.harmonyClass).toBe('complementary')
    expect(m.score).toBeGreaterThanOrEqual(85)
    expect(m.palette.length).toBeGreaterThanOrEqual(2)
  })
  it('5 隨機色塊 分散 ≤75', () => {
    const m = colorHarmony(blocks(320, 240, [[230, 40, 40], [230, 200, 40], [40, 230, 80], [40, 120, 230], [200, 40, 230]]))
    expect(m.harmonyClass).toBe('dispersed')
    expect(m.score).toBeLessThanOrEqual(75)
  })
  it('灰圖 +20 紅 → white-balance「暖」', () => {
    const m = colorHarmony(flat(320, 240, [148, 128, 128]))
    const hnt = m.hints.find((h) => h.principle === 'white-balance')
    expect(hnt?.severity).toBe('warn')
    expect(hnt?.text).toContain('暖')
    expect(m.raw.castR).toBeCloseTo(20, 0)
  })
  it('灰圖 conf≤0.6 且 saturation info、class neutral', () => {
    const m = colorHarmony(randomGray(320, 240, 2))
    expect(m.confidence).toBeLessThanOrEqual(0.6)
    expect(m.hints.some((h) => h.principle === 'saturation' && h.severity === 'info')).toBe(true)
    expect(m.harmonyClass).toBe('neutral')
    expect(m.hints.some((h) => h.principle === 'white-balance')).toBe(false)
  })
  it('高飽和 → saturation warn；單色 → mono', () => {
    const m = colorHarmony(blocks(320, 240, [[255, 0, 0], [255, 40, 0], [230, 0, 20]]))
    expect(m.harmonyClass).toBe('mono')
    expect(m.hints.some((h) => h.principle === 'saturation' && h.severity === 'warn')).toBe(true)
  })
})
