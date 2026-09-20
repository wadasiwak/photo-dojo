// 地平線：近水平邊緣方向的加權直方圖找主峰 → tilt（度，正 = 順時鐘/右側較低）。
import type { Hint, HorizonRaw, MetricResult } from './types'
import type { Edges } from './saliency'
import { boxBlurGray } from '../raster'
import { THRESHOLDS } from './thresholds'
import { finalizeScore, lerpScore, percentileSorted, round } from './scoring'

const T = THRESHOLDS.horizon

export function horizon(edges: Edges, w: number, h: number): MetricResult<HorizonRaw> {
  const n = w * h
  const mag = edges.mag
  // 平均鄰域梯度向量再取角度：直線邊緣的抗鋸齒階梯會讓單像素 Sobel 角度偏向 0°/45°
  const gx = boxBlurGray(edges.gx, w, h, T.gradientSmooth, 1)
  const gy = boxBlurGray(edges.gy, w, h, T.gradientSmooth, 1)
  const sortedMag = Float32Array.from(mag).sort()
  const thr = percentileSorted(sortedMag, T.magPercentile)
  const nBins = Math.round((2 * T.maxAngle) / T.binDeg)
  const hist = new Float64Array(nBins)
  const colMass = new Float64Array(nBins * T.columns) // 每 bin × 欄的質量，做空間一致性
  let totalMass = 0, nearMass = 0
  // 為了之後算峰 bin 的法向散佈，記下每個近水平像素的 bin 與位置
  const pixBin = new Int16Array(n).fill(-1)

  for (let i = 0; i < n; i++) {
    const m = mag[i]
    if (!(m > thr) || m <= 0) continue
    totalMass += m
    // 梯度方向 + 90° = 邊緣方向，折到 (−90, 90]
    let phi = (Math.atan2(gy[i], gx[i]) * 180) / Math.PI + 90
    while (phi > 90) phi -= 180
    while (phi <= -90) phi += 180
    if (Math.abs(phi) > T.maxAngle) continue
    nearMass += m
    const b = Math.min(nBins - 1, Math.floor((phi + T.maxAngle) / T.binDeg))
    hist[b] += m
    const x = i % w
    const col = Math.min(T.columns - 1, Math.floor((x / w) * T.columns))
    colMass[b * T.columns + col] += m
    pixBin[i] = b
  }

  const empty: MetricResult<HorizonRaw> = { raw: { tilt: 0, strength: 0 }, score: 100, confidence: 0, hints: [] }
  if (totalMass <= 0 || nearMass <= 0) return empty

  // 空間一致性：bin（含左右鄰）要在 ≥ minColumns 欄有質量才算一條線
  const binMass3 = (b: number): number => hist[b] + (b > 0 ? hist[b - 1] : 0) + (b < nBins - 1 ? hist[b + 1] : 0)
  const columnsHit = (b: number): number => {
    let c = 0
    for (let col = 0; col < T.columns; col++) {
      let m = colMass[b * T.columns + col]
      if (b > 0) m += colMass[(b - 1) * T.columns + col]
      if (b < nBins - 1) m += colMass[(b + 1) * T.columns + col]
      if (m > 0) c++
    }
    return c
  }
  let peak = -1, peakMass = 0
  for (let b = 0; b < nBins; b++) {
    if (hist[b] <= 0) continue
    const m3 = binMass3(b)
    if (m3 > peakMass && columnsHit(b) >= T.minColumns) { peak = b; peakMass = m3 }
  }
  if (peak < 0) return empty

  // 次 bin 精度：峰 ±3 bin（±1.5°）內像素的結構張量（Σ g gᵀ）主方向。
  // 單像素 Sobel 角度在抗鋸齒階梯邊緣有系統偏差、取角度平均無法抵銷；梯度向量二次矩的主軸則無偏且不受極性影響。
  let jxx = 0, jxy = 0, jyy = 0
  for (let i = 0; i < n; i++) {
    const b = pixBin[i]
    if (b < 0 || Math.abs(b - peak) > 3) continue
    const x = gx[i], y = gy[i]
    jxx += x * x; jxy += x * y; jyy += y * y
  }
  let tilt: number
  if (jxx + jyy > 0) {
    // 梯度主方向（法向）→ 邊緣方向 +90°，折到 (−90, 90]
    let phi = (0.5 * Math.atan2(2 * jxy, jxx - jyy) * 180) / Math.PI + 90
    while (phi > 90) phi -= 180
    while (phi <= -90) phi += 180
    tilt = phi
  } else tilt = -T.maxAngle + (peak + 0.5) * T.binDeg

  // 法向散佈：峰 bin 像素投影到法線上的 p10–p90 範圍 / h；單一線很窄，格紋/紋理鋪滿整圖
  const ang = (tilt * Math.PI) / 180
  const nx = -Math.sin(ang), ny = Math.cos(ang)
  const rhos: number[] = []
  for (let i = 0; i < n; i++) {
    const b = pixBin[i]
    if (b < 0 || Math.abs(b - peak) > 1) continue
    const x = i % w, y = (i - x) / w
    rhos.push(x * nx + y * ny)
  }
  const rs = Float32Array.from(rhos).sort()
  const spread = rs.length > 1 ? (percentileSorted(rs, 90) - percentileSorted(rs, 10)) / h : 1
  const spreadFactor = lerpScore(spread, T.spreadConf)

  const strength = peakMass / nearMass
  const nearShare = nearMass / totalMass
  const confidence = lerpScore(strength, T.strengthConf) * lerpScore(nearShare, T.nearShareConf) * spreadFactor
  const absTilt = Math.abs(tilt)
  const score = finalizeScore(lerpScore(absTilt, T.score))

  const hints: Hint[] = []
  if (absTilt > T.hintTilt && confidence > T.hintConf) {
    hints.push({ principle: 'horizon-level', severity: 'warn', text: `主要水平線量測傾斜約 ${round(absTilt, 1)}°（${tilt > 0 ? '右側較低' : '左側較低'}）` })
  }
  return {
    raw: { tilt: round(tilt, 2), strength: round(strength, 3), nearShare: round(nearShare, 3), spread: round(spread, 3) },
    score,
    confidence: round(confidence, 3),
    hints,
  }
}
