// 鑑賞題產生器：從 Commons 圖池取一張好圖 → 載圖（CORS）→ Engine 1 報告 → pickFlaw → makeVariant。
import { POOL, PAIRS, type CommonsImage, type ComparisonPair } from '../content/index.ts'
import type { PrincipleId } from '../content/principles.ts'
import { analyze } from './analyze/index.ts'
import type { LocalReport } from './analyze/types.ts'
import { rasterFromImage } from './raster/fromImage.ts'
import { rasterToDataUrl } from './raster/toBlob.ts'
import { crop, resampleBilinear, type Raster } from './raster/index.ts'
import { FLAWS, makeVariant, pickFlaw, eligibleFlaws, measureFromAnalyze, setDefaultMeasure, type Difficulty, type FlawId, type SrsWeights } from './variants/index.ts'
import type { SrsState } from './srs.ts'
import { weightOf } from './srs.ts'
import { hashString, mulberry32 } from './seed.ts'

setDefaultMeasure(measureFromAnalyze(analyze))

export interface VariantItem {
  kind: 'variant'
  id: string
  image: CommonsImage
  goodUrl: string
  badUrl: string
  flawId: FlawId
  flawLabel: string
  principle: PrincipleId
  explain: string
  difficulty: Difficulty
  /** 好圖放左邊？ */
  goodOnLeft: boolean
}
export interface PairItem {
  kind: 'pair'
  id: string
  pair: ComparisonPair
  goodOnLeft: boolean
}
export type QuizItem = VariantItem | PairItem

const reportCache = new Map<string, { raster: Raster; report: LocalReport }>()

export function loadImage(src: string, timeoutMs = 20_000): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    const t = setTimeout(() => reject(new Error('timeout')), timeoutMs)
    img.onload = () => { clearTimeout(t); resolve(img) }
    img.onerror = () => { clearTimeout(t); reject(new Error('load failed')) }
    img.src = src
  })
}

async function prepareSource(image: CommonsImage): Promise<{ raster: Raster; report: LocalReport }> {
  const hit = reportCache.get(image.id)
  if (hit) return hit
  const img = await loadImage(image.src)
  const raster = rasterFromImage(img, 800)
  const report = analyze(rasterFromImage(img, 480))
  const v = { raster, report }
  reportCache.set(image.id, v)
  return v
}

/** SRS 權重（依原則）→ 壞法權重 */
function flawWeights(srs: SrsState): SrsWeights {
  const out: SrsWeights = {}
  for (const id of Object.keys(FLAWS) as FlawId[]) out[id] = weightOf(srs, FLAWS[id].principle)
  return out
}

/** 依 seed 挑一張至少有一種合格壞法（僅看 tags）的圖 */
function pickImage(seed: number, exclude: Set<string>): CommonsImage | null {
  const r = mulberry32(seed)
  const candidates = POOL.filter((i) => !exclude.has(i.id) && eligibleFlaws(i.tags).length > 0)
  if (!candidates.length) return null
  return candidates[Math.floor(r() * candidates.length)]
}

export async function buildVariantItem(srs: SrsState, difficulty: Difficulty, seedStr: string, recent: Set<string>): Promise<VariantItem | null> {
  const seed = hashString(seedStr)
  const tried = new Set(recent)
  for (let attempt = 0; attempt < 6; attempt++) {
    const image = pickImage(seed + attempt * 7919, tried)
    if (!image) return null
    tried.add(image.id)
    let src: { raster: Raster; report: LocalReport }
    try {
      src = await prepareSource(image)
    } catch {
      continue // 圖掛了就換一張
    }
    const flawId = pickFlaw(image.tags, src.report, flawWeights(srs), `${seedStr}:${image.id}`)
    if (!flawId) continue
    const variant = makeVariant(src.raster, flawId, `${seedStr}:${image.id}`, difficulty, src.report)
    let good = src.raster
    if (variant.cropApplied) {
      const c = variant.cropApplied
      good = resampleBilinear(crop(src.raster, c.x, c.y, c.w, c.h), src.raster.w, src.raster.h)
    }
    const r = mulberry32(seed ^ 0x9e3779b9)
    return {
      kind: 'variant',
      id: `${image.id}:${flawId}:${seed % 1_000_000_000}`,
      image,
      goodUrl: rasterToDataUrl(good, 0.9),
      badUrl: rasterToDataUrl(variant.raster, 0.9),
      flawId,
      flawLabel: FLAWS[flawId].label,
      principle: variant.principle,
      explain: variant.explain,
      difficulty: variant.difficulty,
      goodOnLeft: r() < 0.5,
    }
  }
  return null
}

export function buildPairItem(seedStr: string, recent: Set<string>): PairItem | null {
  const r = mulberry32(hashString(seedStr))
  const cands = PAIRS.filter((p: ComparisonPair) => !recent.has(p.id))
  const pool = cands.length ? cands : PAIRS
  if (!pool.length) return null
  const pair = pool[Math.floor(r() * pool.length)]
  return { kind: 'pair', id: pair.id, pair, goodOnLeft: r() < 0.5 }
}
