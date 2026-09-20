import { describe, expect, it } from 'vitest'
import { PRINCIPLE_IDS } from '../../../content/principles'
import type { PrincipleId } from '../../../content/principles'
import { SOURCE_TAGS } from '../../../content/types'
import { eligibleFlaws, FLAW_IDS, FLAWS, pickFlaw } from '../index'
import { fakeReport } from './fakeReport'

describe('registry', () => {
  it('每個 FlawId 的 principle 都在 PRINCIPLE_IDS、tags 都在 SOURCE_TAGS', () => {
    for (const id of FLAW_IDS) {
      const m = FLAWS[id]
      expect(PRINCIPLE_IDS).toContain(m.principle)
      for (const t of [...m.requires, ...m.excludes]) expect(SOURCE_TAGS).toContain(t)
      expect(m.label.length).toBeGreaterThan(0)
      for (const d of ['hard', 'medium', 'easy'] as const) expect(Object.keys(m.tiers[d]).length).toBeGreaterThan(0)
    }
  })

  it('8 個原則各至少一個壞法', () => {
    const want: PrincipleId[] = ['horizon-level', 'exposure', 'subject-placement', 'rule-of-thirds', 'saturation', 'white-balance', 'sharpness', 'noise']
    const have = new Set(FLAW_IDS.map((id) => FLAWS[id].principle))
    for (const p of want) expect(have.has(p), p).toBe(true)
  })
})

describe('pickFlaw / eligibleFlaws', () => {
  const report = fakeReport()

  it("tags=['portrait'] 永不抽 tilt", () => {
    for (let s = 0; s < 50; s++) expect(pickFlaw(['portrait'], report, {}, s)).not.toBe('tilt')
    expect(eligibleFlaws(['portrait'])).not.toContain('tilt')
    expect(eligibleFlaws(['horizon'])).toContain('tilt')
    expect(eligibleFlaws(['landscape'])).not.toContain('tilt') // 沒有 horizon/architecture 就不歪
  })

  it("tags=['bw'] 永不抽 desaturate / colorCast", () => {
    for (let s = 0; s < 50; s++) {
      const f = pickFlaw(['bw', 'horizon'], report, {}, s)
      expect(f).not.toBe('desaturate')
      expect(f).not.toBe('colorCast')
    }
  })

  it('全排除回 null', () => {
    const all = Object.fromEntries(FLAW_IDS.map((id) => [id, 0]))
    expect(pickFlaw(['horizon'], report, all, 1)).toBeNull()
    expect(pickFlaw(['bw', 'night', 'busy', 'symmetric', 'centered', 'highkey', 'lowkey', 'portrait'], fakeReport({ sharpnessScore: 30 }), {}, 1)).toBeNull()
  })

  it('SRS 權重 3:1 抽樣比 ≈3×（±20%）', () => {
    const weights = Object.fromEntries(FLAW_IDS.map((id) => [id, 0])) as Record<string, number>
    weights.blur = 3
    weights.noise = 1
    let blur = 0, noise = 0
    for (let s = 0; s < 4000; s++) {
      const f = pickFlaw([], report, weights, `srs-${s}`)
      if (f === 'blur') blur++
      else if (f === 'noise') noise++
      else throw new Error(`unexpected ${f}`)
    }
    const ratio = blur / noise
    expect(ratio).toBeGreaterThan(2.4)
    expect(ratio).toBeLessThan(3.6)
  })

  it('同 seed 抽同一個', () => {
    expect(pickFlaw(['horizon'], report, {}, 'x')).toBe(pickFlaw(['horizon'], report, {}, 'x'))
  })
})
