// 測試用 LocalReport 工廠：預設「一切正常」的報告，測試只覆寫關心的欄位。
import type { MetricResult } from '../../analyze/types'
import type { LocalReport, Saliency } from '../types'

const ok = <R extends Record<string, number>>(raw: R, score = 90): MetricResult<R> => ({ raw, score, confidence: 1, hints: [] })

export interface FakeOverrides {
  tilt?: number
  tiltConfidence?: number
  clipHigh?: number
  clipLow?: number
  dThirds?: number
  symmetryScore?: number
  meanSat?: number
  castMagnitude?: number
  neutralShare?: number
  sharpnessScore?: number
  noiseScore?: number
  emptyFraction?: number
  saliency?: Partial<Saliency>
}

export function fakeReport(o: FakeOverrides = {}): LocalReport {
  const horizon = ok({ tilt: o.tilt ?? 0, strength: 0.5 })
  horizon.confidence = o.tiltConfidence ?? 1
  return {
    size: { w: 800, h: 600 },
    metrics: {
      exposure: ok({ clipLow: o.clipLow ?? 0, clipHigh: o.clipHigh ?? 0, median: 120, mean: 120, dynamicRange: 150 }),
      thirds: ok({ dThirds: o.dThirds ?? 0.05, dCenter: 0.2, edgeDist: 0.3 }),
      horizon,
      negativeSpace: ok({ emptyFraction: o.emptyFraction ?? 0.5, emptyContiguity: 0.5 }),
      leadingLines: ok({ lineCount: 0, convergent: 0 }),
      colorHarmony: {
        ...ok({
          meanSat: o.meanSat ?? 0.5,
          hueDispersion: 0.2,
          castR: 0,
          castB: 0,
          castMagnitude: o.castMagnitude ?? 3,
          neutralShare: o.neutralShare ?? 0.4,
        }),
        harmonyClass: 'mono',
        palette: [],
      },
      sharpness: ok({ sharp: 0.05, lapVarGlobal: 100, lapVarSubject: 100 }, o.sharpnessScore ?? 90),
      noise: ok({ noiseSigma: 1, flatCells: 10 }, o.noiseScore ?? 95),
      symmetry: ok({ symmetry: 0.3, errLR: 0.7, errTB: 0.7 }, o.symmetryScore ?? 30),
    },
    saliency: {
      cx: 0.33,
      cy: 0.33,
      bbox: { x0: 0.23, y0: 0.2, x1: 0.43, y1: 0.46 },
      mass: 3,
      ...o.saliency,
    },
    overall: 85,
    hints: [],
    disclaimer: 'reference-indicators',
  }
}
