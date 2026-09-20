// Engine 2 入口：makeVariant / pickFlaw / eligibleFlaws。
// 確定性：所有亂數取自 rng(hashSeed(seed, flawIndex))；同 seed 位元組相同。
import type { SourceTag } from '../../content/types'
import { blurFlaw } from './flaws/blur'
import { centerCropFlaw } from './flaws/centerCrop'
import { colorCastFlaw } from './flaws/colorCast'
import type { FlawContext, FlawImpl } from './flaws/common'
import { cropSubjectFlaw } from './flaws/cropSubject'
import { desaturateFlaw } from './flaws/desaturate'
import { overexposeFlaw, underexposeFlaw } from './flaws/exposure'
import { noiseFlaw } from './flaws/noise'
import { tiltFlaw } from './flaws/tilt'
import { getDefaultMeasure } from './measure'
import { FLAWS, GUARD_BANDS } from './registry'
import { DIFFICULTIES, FLAW_IDS } from './types'
import type { Difficulty, FlawId, LocalReport, MakeVariantOptions, Raster, SrsWeights, VariantResult } from './types'
import { hashSeed, rng } from './util'

export type { Difficulty, FlawId, FlawParams, VariantResult, CropRect, Measure, MakeVariantOptions, SrsWeights } from './types'
export { FLAW_IDS, DIFFICULTIES } from './types'
export { FLAWS, GUARD_BANDS } from './registry'
export type { FlawMeta } from './registry'
export { localMeasure, measureFromAnalyze, setDefaultMeasure, getDefaultMeasure, loadAnalyzeMeasure } from './measure'

const IMPLS: Record<FlawId, FlawImpl> = {
  tilt: tiltFlaw,
  overexpose: overexposeFlaw,
  underexpose: underexposeFlaw,
  cropSubject: cropSubjectFlaw,
  centerCrop: centerCropFlaw,
  desaturate: desaturateFlaw,
  colorCast: colorCastFlaw,
  blur: blurFlaw,
  noise: noiseFlaw,
}

/** 只看來源標籤的資格（requires 至少一個、excludes 一個都不能有） */
export function tagsAllow(flawId: FlawId, tags: readonly SourceTag[]): boolean {
  const meta = FLAWS[flawId]
  if (meta.requires.length > 0 && !meta.requires.some((t) => tags.includes(t))) return false
  return !meta.excludes.some((t) => tags.includes(t))
}

/** 標籤資格 ∧ runtime 守門（report 未給則只看標籤） */
export function eligibleFlaws(tags: readonly SourceTag[], report?: LocalReport): FlawId[] {
  return FLAW_IDS.filter((id) => tagsAllow(id, tags) && (!report || IMPLS[id].guard(report)))
}

/**
 * 依 SRS 權重（缺省 1）在合格壞法中確定性抽樣；無合格回 null。
 * 權重 ≤0 視為不抽。
 */
export function pickFlaw(
  tags: readonly SourceTag[],
  report: LocalReport | undefined,
  srsWeights: SrsWeights,
  seed: string | number,
): FlawId | null {
  const pool = eligibleFlaws(tags, report)
    .map((id) => ({ id, w: srsWeights[id] ?? 1 }))
    .filter((x) => x.w > 0)
  if (pool.length === 0) return null
  const total = pool.reduce((a, x) => a + x.w, 0)
  let u = rng(hashSeed('pick', seed))() * total
  for (const x of pool) {
    u -= x.w
    if (u < 0) return x.id
  }
  return pool[pool.length - 1].id
}

const nextDifficulty = (d: Difficulty): Difficulty | null => {
  const i = DIFFICULTIES.indexOf(d)
  return i < DIFFICULTIES.length - 1 ? DIFFICULTIES[i + 1] : null
}

/**
 * 產生一張壞版本。
 * - report：源圖的 Engine 1 報告（給 saliency/守門）；沒給時 crop 類會自行量測 saliency。
 * - 反卡通守門：check 回 strong → 參數 ×0.75 重做一次；weak → 升一級難度重做一次。最多兩次渲染。
 */
export function makeVariant(
  src: Raster,
  flawId: FlawId,
  seed: string | number,
  difficulty: Difficulty = 'medium',
  report?: LocalReport,
  opts: MakeVariantOptions = {},
): VariantResult {
  const impl = IMPLS[flawId]
  const ctx: FlawContext = {
    src,
    scale: Math.max(src.w, src.h) / 800,
    report,
    measure: opts.measure ?? getDefaultMeasure(),
    fill: opts.fill,
  }
  const r = rng(hashSeed(seed, FLAW_IDS.indexOf(flawId)))

  let params = impl.plan(r, difficulty, ctx)
  let strength = 1
  let rendered = impl.render(params, strength, ctx)
  let attempts = 1
  let usedDifficulty = difficulty
  const verdict = impl.check ? impl.check(rendered.raster, params, strength, ctx) : 'ok'
  if (verdict === 'strong') {
    strength = GUARD_BANDS.retryScale
    rendered = impl.render(params, strength, ctx)
    attempts++
  } else if (verdict === 'weak') {
    const up = nextDifficulty(difficulty)
    if (up) {
      usedDifficulty = up
      params = impl.plan(r, up, ctx)
      rendered = impl.render(params, strength, ctx)
      attempts++
    }
  }
  const finalParams = { ...params, ...(rendered.params ?? {}), strength, attempts, verdict }
  return {
    raster: rendered.raster,
    flawId,
    principle: FLAWS[flawId].principle,
    difficulty: usedDifficulty,
    params: finalParams,
    explain: impl.explain(finalParams, rendered.raster, ctx),
    cropApplied: rendered.cropApplied,
  }
}
