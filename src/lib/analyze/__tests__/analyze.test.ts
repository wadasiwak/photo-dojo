import { describe, expect, it } from 'vitest'
import { PRINCIPLE_ID_SET } from '../../../content/principles'
import { analyze, mergeHints } from '../index'
import { addGaussianNoise, disc, drawLine, flat, tiltedLine } from './synth'
import type { MetricKey } from '../types'

const KEYS: MetricKey[] = ['exposure', 'thirds', 'horizon', 'negativeSpace', 'leadingLines', 'colorHarmony', 'sharpness', 'noise', 'symmetry']

describe('analyze', () => {
  it('所有 metric key 存在、hint principle 合法、overall ∈ [0,100]、去重', () => {
    const r = tiltedLine(640, 427, 5, 2, [170, 190, 230], [90, 110, 60])
    drawLine(r, 0, 1, 0.66, 0.5, 3, [30, 30, 30])
    const rep = analyze(r)
    for (const k of KEYS) {
      const m = rep.metrics[k]
      expect(m).toBeDefined()
      expect(m.score).toBeGreaterThanOrEqual(0)
      expect(m.score).toBeLessThanOrEqual(100)
      expect(m.confidence).toBeGreaterThanOrEqual(0)
      expect(m.confidence).toBeLessThanOrEqual(1)
    }
    expect(rep.overall).toBeGreaterThanOrEqual(0)
    expect(rep.overall).toBeLessThanOrEqual(100)
    expect(rep.disclaimer).toBe('reference-indicators')
    expect(rep.size).toEqual({ w: 640, h: 427 })
    const principles = rep.hints.map((h) => h.principle)
    for (const p of principles) expect(PRINCIPLE_ID_SET.has(p)).toBe(true)
    expect(new Set(principles).size).toBe(principles.length)
    // warn 排在 info 前
    const firstInfo = rep.hints.findIndex((h) => h.severity === 'info')
    const lastWarn = rep.hints.map((h) => h.severity).lastIndexOf('warn')
    if (firstInfo >= 0 && lastWarn >= 0) expect(lastWarn).toBeLessThan(firstInfo)
    expect(rep.hints.some((h) => h.principle === 'horizon-level')).toBe(true)
  })

  it('mergeHints 去重且 warn 優先', () => {
    const out = mergeHints([
      { principle: 'exposure', severity: 'info', text: 'a' },
      { principle: 'noise', severity: 'warn', text: 'b' },
      { principle: 'exposure', severity: 'warn', text: 'c' },
    ])
    expect(out).toHaveLength(2)
    expect(out[0].severity).toBe('warn')
    expect(out.find((h) => h.principle === 'exposure')?.text).toBe('c')
  })

  it('flat 圖 horizon 不影響 overall', () => {
    const rep = analyze(flat(400, 300, 128))
    expect(rep.metrics.horizon.confidence).toBeLessThan(0.3)
    // horizon 滿分卻被剔除；若被納入 overall 會被拉高
    const w = { exposure: 0.2, sharpness: 0.2, thirds: 0.15, colorHarmony: 0.15, horizon: 0.1, negativeSpace: 0.1, leadingLines: 0.05, noise: 0.05 } as Record<string, number>
    let ws = 0, acc = 0
    for (const k of Object.keys(w)) {
      const m = rep.metrics[k as MetricKey]
      if (m.confidence < 0.3) continue
      ws += w[k]; acc += w[k] * m.score
    }
    expect(rep.overall).toBe(Math.round(acc / ws))
  })

  it('noisy 圖給 noise warn 且 saliency 在界內', () => {
    const rep = analyze(addGaussianNoise(disc(480, 320, 0.33, 0.66, 0.1, [220, 60, 60], 128), 12, 3))
    expect(rep.hints.some((h) => h.principle === 'noise')).toBe(true)
    expect(rep.saliency.cx).toBeGreaterThanOrEqual(0)
    expect(rep.saliency.cx).toBeLessThanOrEqual(1)
  })

  it.skipIf(!!process.env.CI)('1280×853 合成圖 <300ms', () => {
    const r = addGaussianNoise(tiltedLine(1280, 853, 3, 2, [170, 190, 230], [90, 110, 60]), 4, 1)
    analyze(r) // 暖機
    const t0 = performance.now()
    analyze(r)
    const dt = performance.now() - t0
    expect(dt).toBeLessThan(300)
  })
})
