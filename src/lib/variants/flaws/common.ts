// 各壞法共用的實作介面。index.ts 的 orchestrator 依此驅動：plan → render → check → 必要時重做。
import type { Difficulty, FlawId, FlawParams, LocalReport, Measure, Raster, CropRect } from '../types'
import type { Rng } from '../util'

export interface FlawContext {
  src: Raster
  /** 長邊 / 800：像素單位參數（模糊半徑）依此縮放 */
  scale: number
  report?: LocalReport
  measure: Measure
  fill?: readonly [number, number, number]
}

export interface Rendered {
  raster: Raster
  cropApplied: CropRect | null
  /** render 可補充實際使用的參數（例如視窗矩形） */
  params?: FlawParams
}

/** ok＝落帶；weak＝效果不夠（升一級難度重試）；strong＝太卡通（參數 ×0.75 重試） */
export type Verdict = 'ok' | 'weak' | 'strong'

export interface FlawImpl {
  id: FlawId
  /** runtime 守門：源圖 LocalReport 是否適合此壞法 */
  guard(report: LocalReport): boolean
  /** 抽所有亂數，產出可序列化參數 */
  plan(r: Rng, difficulty: Difficulty, ctx: FlawContext): FlawParams
  /** strength 1＝原參數，0.75＝守門超帶後的縮小版 */
  render(params: FlawParams, strength: number, ctx: FlawContext): Rendered
  /** 反卡通守門；沒定義視為 ok */
  check?(out: Raster, params: FlawParams, strength: number, ctx: FlawContext): Verdict
  explain(params: FlawParams, out: Raster, ctx: FlawContext): string
}

export const num = (p: FlawParams, k: string): number => {
  const v = p[k]
  if (typeof v !== 'number') throw new Error(`param ${k} 不是數字`)
  return v
}

export const round = (x: number, digits = 2): number => {
  const m = 10 ** digits
  return Math.round(x * m) / m
}

/** 在 [min,max] 均勻抽一值（含二位小數） */
export const uniform = (r: Rng, min: number, max: number): number => round(min + r() * (max - min))
