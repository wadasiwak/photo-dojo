// Engine 1 對外契約。Engine 2（variants）與 UI 只依賴這個檔的型別與 index.ts 匯出的函式。
import type { PrincipleId } from '../../content/principles'
import type { Raster } from '../raster/types'
export type { Raster }

export type Severity = 'info' | 'warn'

export interface Hint {
  principle: PrincipleId
  severity: Severity
  /** 繁體中文、講「量到什麼」不下美感判決，例「亮部約 12% 接近純白」 */
  text: string
}

export interface MetricResult<Raw = Record<string, number>> {
  raw: Raw
  /** 0–100 */
  score: number
  /** 0–1，指標對自身判讀的信心；<0.3 不進 overall、UI 灰顯 */
  confidence: number
  hints: Hint[]
}

export interface Saliency {
  /** 主體質心 0–1 */
  cx: number
  cy: number
  /** 主體 bbox 0–1 */
  bbox: { x0: number; y0: number; x1: number; y1: number }
  /** 能量集中度：保留像素平均能量 / 全圖平均能量（≈1 表示沒有明確主體） */
  mass: number
}

export type MetricKey =
  | 'exposure'
  | 'thirds'
  | 'horizon'
  | 'negativeSpace'
  | 'leadingLines'
  | 'colorHarmony'
  | 'sharpness'
  | 'noise'
  | 'symmetry'

export interface ExposureRaw extends Record<string, number> { clipLow: number; clipHigh: number; median: number; mean: number; dynamicRange: number }
export interface ThirdsRaw extends Record<string, number> { dThirds: number; dCenter: number; edgeDist: number }
export interface HorizonRaw extends Record<string, number> { tilt: number; strength: number }
export interface NegativeSpaceRaw extends Record<string, number> { emptyFraction: number; emptyContiguity: number }
export interface LeadingLinesRaw extends Record<string, number> { lineCount: number; convergent: number }
export interface ColorRaw extends Record<string, number> { meanSat: number; hueDispersion: number; castR: number; castB: number; castMagnitude: number; neutralShare: number }
export interface SharpnessRaw extends Record<string, number> { sharp: number; lapVarGlobal: number; lapVarSubject: number }
export interface NoiseRaw extends Record<string, number> { noiseSigma: number; flatCells: number }
export interface SymmetryRaw extends Record<string, number> { symmetry: number; errLR: number; errTB: number }

export interface LocalReport {
  size: { w: number; h: number }
  metrics: {
    exposure: MetricResult<ExposureRaw>
    thirds: MetricResult<ThirdsRaw>
    horizon: MetricResult<HorizonRaw>
    negativeSpace: MetricResult<NegativeSpaceRaw>
    leadingLines: MetricResult<LeadingLinesRaw>
    colorHarmony: MetricResult<ColorRaw> & { harmonyClass: 'mono' | 'complementary' | 'triadic' | 'dispersed' | 'neutral'; palette: string[] }
    sharpness: MetricResult<SharpnessRaw>
    noise: MetricResult<NoiseRaw>
    symmetry: MetricResult<SymmetryRaw>
  }
  saliency: Saliency
  /** 0–100，confidence 加權 */
  overall: number
  /** 依 severity 排序、同 principle 去重 */
  hints: Hint[]
  disclaimer: 'reference-indicators'
}
