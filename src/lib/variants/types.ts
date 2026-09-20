// Engine 2（同圖變體）對外契約。UI 與測試只依賴此檔與 index.ts 的匯出。
import type { PrincipleId } from '../../content/principles'
import type { LocalReport, Saliency } from '../analyze/types'
import type { Raster } from '../raster/types'
export type { Raster, LocalReport, Saliency }

export const FLAW_IDS = [
  'tilt',
  'overexpose',
  'underexpose',
  'cropSubject',
  'centerCrop',
  'desaturate',
  'colorCast',
  'blur',
  'noise',
] as const
export type FlawId = (typeof FLAW_IDS)[number]

/** hard＝差異最細微（最難分辨），easy＝差異最明顯 */
export const DIFFICULTIES = ['hard', 'medium', 'easy'] as const
export type Difficulty = (typeof DIFFICULTIES)[number]

export interface CropRect {
  x: number
  y: number
  w: number
  h: number
}

/** 壞法參數：全部可序列化，方便 debug 面板顯示與測試比對 */
export type FlawParams = Record<string, number | string>

export interface VariantResult {
  raster: Raster
  flawId: FlawId
  principle: PrincipleId
  difficulty: Difficulty
  params: FlawParams
  /** 繁體中文解析，中性語氣、不提左右（UI 決定擺哪邊） */
  explain: string
  /**
   * 非 null 時，好圖也要套同樣裁切（源圖座標）再縮回原尺寸，
   * 避免「內容比較多的那張是好圖」洩題。目前只有 tilt 類回傳。
   */
  cropApplied: CropRect | null
}

/**
 * 反卡通守門用的量測介面。預設用 variants 內建的輕量實作；
 * UI 接線時可用 measureFromAnalyze(analyze) 換成 Engine 1，測試可注入合成量測器。
 */
export interface Measure {
  /** 水平線傾角（度，正值＝右側下沉） */
  tilt(r: Raster): number
  /** 亮部裁切百分比（0–100，像素亮度 >247） */
  clipHigh(r: Raster): number
  /** 暗部裁切百分比（0–100，像素亮度 <8） */
  clipLow(r: Raster): number
  /** 清晰度分數 0–100 */
  sharpness(r: Raster): number
  /** 平坦區雜訊 σ（0–255 尺度） */
  noiseSigma(r: Raster): number
  saliency(r: Raster): Saliency
  /** 平均 HSV 飽和度 0–1 */
  meanSat(r: Raster): number
  /** 色偏向量長度（R−G, B−G 平面） */
  castMagnitude(r: Raster): number
}

export interface MakeVariantOptions {
  measure?: Measure
  /** 旋轉取樣超界時填的哨兵色（測試偵測黑角用） */
  fill?: readonly [number, number, number]
}

/** SRS 權重：缺的 flaw 視為 1 */
export type SrsWeights = Partial<Record<FlawId, number>>
