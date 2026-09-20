// Engine 2 私有像素工具。刻意自給自足（只依賴 Raster 型別），
// 只從 ../raster 拿 rng/hashSeed（確定性必須與 Engine 1 一致），其餘像素運算自帶，
// 讓 variants 的測試不受 Engine 1 演算法調整影響。
// 所有函式皆為純函式、不碰 DOM/canvas。
import type { Raster } from '../raster/types'

export type Rng = () => number

// ── 隨機 ─────────────────────────────────────────────────────
// 與 Engine 1 共用同一份 mulberry32 / FNV-1a：題目 id 對應的變體在兩邊必須一致。
export { rng, hashSeed } from '../raster'

/** 標準常態（Box-Muller）；每次呼叫吃兩個 rng 值 */
export function gaussian(r: Rng): number {
  let u = 0
  while (u === 0) u = r()
  const v = r()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

// ── 基本 ─────────────────────────────────────────────────────

export function createRaster(w: number, h: number, fill?: readonly [number, number, number]): Raster {
  const data = new Uint8ClampedArray(w * h * 4)
  if (fill) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = fill[0]
      data[i + 1] = fill[1]
      data[i + 2] = fill[2]
      data[i + 3] = 255
    }
  } else {
    for (let i = 3; i < data.length; i += 4) data[i] = 255
  }
  return { w, h, data }
}

export function cloneRaster(r: Raster): Raster {
  return { w: r.w, h: r.h, data: new Uint8ClampedArray(r.data) }
}

export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x)

/** Rec.601 亮度 */
export const luma = (r: number, g: number, b: number): number => 0.299 * r + 0.587 * g + 0.114 * b

export function toGray(r: Raster): Float32Array {
  const g = new Float32Array(r.w * r.h)
  const d = r.data
  for (let i = 0, p = 0; i < g.length; i++, p += 4) g[i] = luma(d[p], d[p + 1], d[p + 2])
  return g
}

export function meanLuma(r: Raster): number {
  const g = toGray(r)
  let s = 0
  for (let i = 0; i < g.length; i++) s += g[i]
  return s / g.length
}

/** 分段線性映射：pts 依 x 遞增，超界取端點 */
export function lerpScore(x: number, pts: ReadonlyArray<readonly [number, number]>): number {
  if (x <= pts[0][0]) return pts[0][1]
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]
    const [x1, y1] = pts[i]
    if (x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0)
  }
  return pts[pts.length - 1][1]
}

// ── 梯度 ─────────────────────────────────────────────────────

export interface Sobel {
  mag: Float32Array
  gx: Float32Array
  gy: Float32Array
}

/** 3×3 Sobel，邊界 clamp（所以圖框本身不會產生邊緣） */
export function sobel(gray: Float32Array, w: number, h: number): Sobel {
  const mag = new Float32Array(w * h)
  const gx = new Float32Array(w * h)
  const gy = new Float32Array(w * h)
  const at = (x: number, y: number) => gray[clamp(y, 0, h - 1) * w + clamp(x, 0, w - 1)]
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = at(x - 1, y - 1), b = at(x, y - 1), c = at(x + 1, y - 1)
      const d = at(x - 1, y), f = at(x + 1, y)
      const g = at(x - 1, y + 1), hh = at(x, y + 1), i = at(x + 1, y + 1)
      const sx = -a + c - 2 * d + 2 * f - g + i
      const sy = -a - 2 * b - c + g + 2 * hh + i
      const k = y * w + x
      gx[k] = sx
      gy[k] = sy
      mag[k] = Math.hypot(sx, sy)
    }
  }
  return { mag, gx, gy }
}

// ── 模糊 ─────────────────────────────────────────────────────

/** 1D 分數半徑盒狀核：|d|≤floor(r) 權重 1，|d|=ceil(r) 權重 frac */
function boxKernel(radius: number): { offsets: number[]; weights: number[] } {
  const n = Math.floor(radius)
  const frac = radius - n
  const offsets: number[] = []
  const weights: number[] = []
  for (let d = -n; d <= n; d++) {
    offsets.push(d)
    weights.push(1)
  }
  if (frac > 1e-6) {
    offsets.push(-(n + 1), n + 1)
    weights.push(frac, frac)
  }
  const sum = weights.reduce((a, b) => a + b, 0)
  return { offsets, weights: weights.map((x) => x / sum) }
}

/** 單通道分離式盒狀模糊（Float32），邊界 clamp */
export function boxBlurGray(src: Float32Array, w: number, h: number, radius: number, passes = 1): Float32Array {
  const { offsets, weights } = boxKernel(radius)
  let cur = src
  for (let p = 0; p < passes; p++) {
    const tmp = new Float32Array(w * h)
    for (let y = 0; y < h; y++) {
      const row = y * w
      for (let x = 0; x < w; x++) {
        let s = 0
        for (let k = 0; k < offsets.length; k++) s += weights[k] * cur[row + clamp(x + offsets[k], 0, w - 1)]
        tmp[row + x] = s
      }
    }
    const out = new Float32Array(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0
        for (let k = 0; k < offsets.length; k++) s += weights[k] * tmp[clamp(y + offsets[k], 0, h - 1) * w + x]
        out[y * w + x] = s
      }
    }
    cur = out
  }
  return cur
}

/** RGB 三通道盒狀模糊（alpha 原樣） */
export function boxBlurRaster(r: Raster, radius: number, passes = 1): Raster {
  const n = r.w * r.h
  const ch = [new Float32Array(n), new Float32Array(n), new Float32Array(n)]
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    ch[0][i] = r.data[p]
    ch[1][i] = r.data[p + 1]
    ch[2][i] = r.data[p + 2]
  }
  const blurred = ch.map((c) => boxBlurGray(c, r.w, r.h, radius, passes))
  const out = cloneRaster(r)
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    out.data[p] = blurred[0][i]
    out.data[p + 1] = blurred[1][i]
    out.data[p + 2] = blurred[2][i]
  }
  return out
}

// ── 色調 ─────────────────────────────────────────────────────

export function makeLUT(fn: (v: number) => number): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256)
  for (let i = 0; i < 256; i++) lut[i] = fn(i)
  return lut
}

/** 對 RGB 三通道套同一張 LUT */
export function applyLUT(r: Raster, lut: Uint8ClampedArray): Raster {
  const out = cloneRaster(r)
  const d = out.data
  for (let p = 0; p < d.length; p += 4) {
    d[p] = lut[d[p]]
    d[p + 1] = lut[d[p + 1]]
    d[p + 2] = lut[d[p + 2]]
  }
  return out
}

/** r,g,b 0–255 → h 0–360, s 0–1, v 0–1 */
export function rgb2hsv(r: number, g: number, b: number): [number, number, number] {
  const rr = r / 255, gg = g / 255, bb = b / 255
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb)
  const d = max - min
  let h = 0
  if (d > 1e-9) {
    if (max === rr) h = 60 * (((gg - bb) / d) % 6)
    else if (max === gg) h = 60 * ((bb - rr) / d + 2)
    else h = 60 * ((rr - gg) / d + 4)
    if (h < 0) h += 360
  }
  return [h, max > 0 ? d / max : 0, max]
}

export function hsv2rgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s
  const hh = ((h % 360) + 360) % 360 / 60
  const x = c * (1 - Math.abs((hh % 2) - 1))
  let r = 0, g = 0, b = 0
  if (hh < 1) [r, g, b] = [c, x, 0]
  else if (hh < 2) [r, g, b] = [x, c, 0]
  else if (hh < 3) [r, g, b] = [0, c, x]
  else if (hh < 4) [r, g, b] = [0, x, c]
  else if (hh < 5) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const m = v - c
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255]
}

/** 平均 HSV 飽和度 */
export function meanSat(r: Raster): number {
  const d = r.data
  let s = 0
  const n = r.w * r.h
  for (let p = 0; p < d.length; p += 4) s += rgb2hsv(d[p], d[p + 1], d[p + 2])[1]
  return s / n
}

/**
 * 色偏向量：低飽和像素（S<0.2、V 0.2–0.9）的 mean(R−G), mean(B−G)；
 * 沒有中性像素時退回全圖。neutralShare 為中性像素比例。
 */
export function castVector(r: Raster): { castR: number; castB: number; magnitude: number; neutralShare: number } {
  const d = r.data
  let sr = 0, sb = 0, n = 0
  let ar = 0, ab = 0
  const total = r.w * r.h
  for (let p = 0; p < d.length; p += 4) {
    const R = d[p], G = d[p + 1], B = d[p + 2]
    const [, s, v] = rgb2hsv(R, G, B)
    ar += R - G
    ab += B - G
    if (s < 0.2 && v >= 0.2 && v <= 0.9) {
      sr += R - G
      sb += B - G
      n++
    }
  }
  const castR = n > 0 ? sr / n : ar / total
  const castB = n > 0 ? sb / n : ab / total
  return { castR, castB, magnitude: Math.hypot(castR, castB), neutralShare: n / total }
}

// ── 幾何 ─────────────────────────────────────────────────────

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export function crop(r: Raster, x: number, y: number, w: number, h: number): Raster {
  const out = createRaster(w, h)
  for (let yy = 0; yy < h; yy++) {
    const sy = clamp(y + yy, 0, r.h - 1)
    for (let xx = 0; xx < w; xx++) {
      const sx = clamp(x + xx, 0, r.w - 1)
      const sp = (sy * r.w + sx) * 4
      const dp = (yy * w + xx) * 4
      out.data[dp] = r.data[sp]
      out.data[dp + 1] = r.data[sp + 1]
      out.data[dp + 2] = r.data[sp + 2]
      out.data[dp + 3] = r.data[sp + 3]
    }
  }
  return out
}

/** 雙線性取樣（座標為像素中心制，超界 clamp） */
function sampleBilinear(r: Raster, fx: number, fy: number, out: Uint8ClampedArray, dp: number): void {
  const x = clamp(fx, 0, r.w - 1)
  const y = clamp(fy, 0, r.h - 1)
  const x0 = Math.floor(x), y0 = Math.floor(y)
  const x1 = Math.min(x0 + 1, r.w - 1), y1 = Math.min(y0 + 1, r.h - 1)
  const tx = x - x0, ty = y - y0
  const p00 = (y0 * r.w + x0) * 4, p10 = (y0 * r.w + x1) * 4
  const p01 = (y1 * r.w + x0) * 4, p11 = (y1 * r.w + x1) * 4
  for (let c = 0; c < 4; c++) {
    const top = r.data[p00 + c] * (1 - tx) + r.data[p10 + c] * tx
    const bot = r.data[p01 + c] * (1 - tx) + r.data[p11 + c] * tx
    out[dp + c] = top * (1 - ty) + bot * ty
  }
}

/** 雙線性縮放到指定尺寸（縮小時先盒狀預濾，避免鋸齒） */
export function resizeTo(r: Raster, w: number, h: number): Raster {
  if (w === r.w && h === r.h) return cloneRaster(r)
  const scale = Math.max(r.w / w, r.h / h)
  const src = scale > 1.2 ? boxBlurRaster(r, (scale - 1) / 2, 1) : r
  const out = createRaster(w, h)
  for (let y = 0; y < h; y++) {
    const sy = ((y + 0.5) * r.h) / h - 0.5
    for (let x = 0; x < w; x++) {
      const sx = ((x + 0.5) * r.w) / w - 0.5
      sampleBilinear(src, sx, sy, out.data, (y * w + x) * 4)
    }
  }
  return out
}

/** 長邊縮到 maxSide 以內（不放大） */
export function resizeMax(r: Raster, maxSide: number): Raster {
  const long = Math.max(r.w, r.h)
  if (long <= maxSide) return r
  const s = maxSide / long
  return resizeTo(r, Math.max(1, Math.round(r.w * s)), Math.max(1, Math.round(r.h * s)))
}

/** 旋轉 deg 後，同比例最大內接矩形的縮放比 s（相對原寬高） */
export function inscribedScale(w: number, h: number, deg: number): number {
  const t = (Math.abs(deg) * Math.PI) / 180
  const c = Math.cos(t), s = Math.sin(t)
  return Math.min(w / (w * c + h * s), h / (w * s + h * c))
}

/** 同比例最大內接矩形（置中、整數） */
export function inscribedRect(w: number, h: number, deg: number): Rect {
  const s = inscribedScale(w, h, deg)
  const rw = Math.floor(w * s), rh = Math.floor(h * s)
  return { x: Math.floor((w - rw) / 2), y: Math.floor((h - rh) / 2), w: rw, h: rh }
}

/**
 * 旋轉 deg（正值＝畫面順時針、右側下沉，即水平線 y = tan(deg)·x）並裁最大內接矩形，
 * 再縮回原尺寸。回傳裁切矩形（源圖座標）給好圖套同樣裁切。
 * fill：取樣超出源圖時填的哨兵色（測試用；正常情況內接矩形不會超界）。
 */
export function rotateCrop(r: Raster, deg: number, fill?: readonly [number, number, number]): { raster: Raster; crop: Rect } {
  const { w, h } = r
  const rect = inscribedRect(w, h, deg)
  const t = (deg * Math.PI) / 180
  const c = Math.cos(t), s = Math.sin(t)
  const out = createRaster(w, h)
  const cx = w / 2, cy = h / 2
  for (let y = 0; y < h; y++) {
    const v = ((y + 0.5) / h) * rect.h - rect.h / 2
    for (let x = 0; x < w; x++) {
      const u = ((x + 0.5) / w) * rect.w - rect.w / 2
      // 輸出＝源圖旋轉 +deg，故輸出點反旋 −deg 找源座標
      const sx = u * c + v * s + cx - 0.5
      const sy = -u * s + v * c + cy - 0.5
      const dp = (y * w + x) * 4
      if (fill && (sx < -0.5 || sy < -0.5 || sx > w - 0.5 || sy > h - 0.5)) {
        out.data[dp] = fill[0]
        out.data[dp + 1] = fill[1]
        out.data[dp + 2] = fill[2]
        out.data[dp + 3] = 255
      } else {
        sampleBilinear(r, sx, sy, out.data, dp)
      }
    }
  }
  return { raster: out, crop: rect }
}
