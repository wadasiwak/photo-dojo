// Engine 2 測試用合成圖。與 Engine 1 的 synth 獨立，避免跨模組耦合。
import type { Raster } from '../types'
import { createRaster, gaussian, rng } from '../util'

export type RGB = readonly [number, number, number]

export const flat = (w: number, h: number, rgb: RGB): Raster => createRaster(w, h, rgb)

/** 線性漸層：dir 'x' 左黑右白、'y' 上黑下白 */
export function gradient(w: number, h: number, dir: 'x' | 'y' = 'x'): Raster {
  const r = createRaster(w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = dir === 'x' ? (x / (w - 1)) * 255 : (y / (h - 1)) * 255
      const p = (y * w + x) * 4
      r.data[p] = r.data[p + 1] = r.data[p + 2] = v
    }
  }
  return r
}

/** 雙色地平線：分界線 y = cy + tan(deg)·(x − cx)，正 deg＝右側下沉 */
export function tiltedLine(w: number, h: number, deg: number, rgbAbove: RGB, rgbBelow: RGB): Raster {
  const r = createRaster(w, h)
  const t = Math.tan((deg * Math.PI) / 180)
  const cx = w / 2, cy = h / 2
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // 反鋸齒：以像素被「下方色」覆蓋的比例混色（真照片與旋轉輸出的邊都是平滑的）
      const edge = cy + t * (x + 0.5 - cx)
      const below = Math.min(1, Math.max(0, y + 1 - edge))
      const p = (y * w + x) * 4
      for (let c = 0; c < 3; c++) r.data[p + c] = rgbAbove[c] * (1 - below) + rgbBelow[c] * below
    }
  }
  return r
}

/** 圓盤（座標 0–1，半徑相對寬） */
export function disc(w: number, h: number, cx: number, cy: number, radius: number, rgb: RGB, bg: RGB): Raster {
  const r = createRaster(w, h, bg)
  const px = cx * w, py = cy * h, rad = radius * w
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (Math.hypot(x + 0.5 - px, y + 0.5 - py) <= rad) {
        const p = (y * w + x) * 4
        r.data[p] = rgb[0]
        r.data[p + 1] = rgb[1]
        r.data[p + 2] = rgb[2]
      }
    }
  }
  return r
}

export function checker(w: number, h: number, cell: number, a: RGB = [30, 30, 30], b: RGB = [225, 225, 225]): Raster {
  const r = createRaster(w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0 ? a : b
      const p = (y * w + x) * 4
      r.data[p] = c[0]
      r.data[p + 1] = c[1]
      r.data[p + 2] = c[2]
    }
  }
  return r
}

export function addGaussianNoise(src: Raster, sigma: number, seed: number): Raster {
  const g = rng(seed)
  const out: Raster = { w: src.w, h: src.h, data: new Uint8ClampedArray(src.data) }
  for (let p = 0; p < out.data.length; p += 4) {
    const n = gaussian(g) * sigma
    out.data[p] += n
    out.data[p + 1] += n
    out.data[p + 2] += n
  }
  return out
}

/** 有幾個像素等於哨兵色 */
export function countColor(r: Raster, rgb: RGB): number {
  let n = 0
  for (let p = 0; p < r.data.length; p += 4) {
    if (r.data[p] === rgb[0] && r.data[p + 1] === rgb[1] && r.data[p + 2] === rgb[2]) n++
  }
  return n
}

export const bytesEqual = (a: Raster, b: Raster): boolean =>
  a.w === b.w && a.h === b.h && a.data.length === b.data.length && a.data.every((v, i) => v === b.data[i])
