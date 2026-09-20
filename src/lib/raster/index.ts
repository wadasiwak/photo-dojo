// 共用像素運算：全部是純函式、不碰 canvas，vitest node 環境可直接測。
// Raster = { w, h, data: RGBA Uint8ClampedArray }。
import type { Raster } from './types'
export type { Raster }

/** 建立全透明黑（或指定填色）的 Raster。 */
export function createRaster(w: number, h: number, fill?: [number, number, number, number?]): Raster {
  const data = new Uint8ClampedArray(w * h * 4)
  if (fill) {
    const [r, g, b, a = 255] = fill
    for (let i = 0; i < data.length; i += 4) {
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = a
    }
  } else {
    for (let i = 3; i < data.length; i += 4) data[i] = 255
  }
  return { w, h, data }
}

export function cloneRaster(r: Raster): Raster {
  return { w: r.w, h: r.h, data: new Uint8ClampedArray(r.data) }
}

// ── 縮放 ────────────────────────────────────────────────────────────────
/** 整數倍 box filter 縮小（每 f×f 格取平均），保平均亮度。 */
function downsampleInt(r: Raster, f: number): Raster {
  const w = Math.floor(r.w / f)
  const h = Math.floor(r.h / f)
  const out = createRaster(w, h)
  const src = r.data
  const dst = out.data
  const n = f * f
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sr = 0, sg = 0, sb = 0, sa = 0
      for (let dy = 0; dy < f; dy++) {
        let i = ((y * f + dy) * r.w + x * f) * 4
        for (let dx = 0; dx < f; dx++, i += 4) {
          sr += src[i]; sg += src[i + 1]; sb += src[i + 2]; sa += src[i + 3]
        }
      }
      const o = (y * w + x) * 4
      dst[o] = sr / n; dst[o + 1] = sg / n; dst[o + 2] = sb / n; dst[o + 3] = sa / n
    }
  }
  return out
}

/** bilinear 重採樣到指定尺寸（放大或小幅縮小用）。 */
export function resampleBilinear(r: Raster, w: number, h: number): Raster {
  const out = createRaster(w, h)
  const src = r.data
  const dst = out.data
  const sx = r.w / w
  const sy = r.h / h
  for (let y = 0; y < h; y++) {
    // 取像素中心對應位置
    const fy = Math.min(r.h - 1, Math.max(0, (y + 0.5) * sy - 0.5))
    const y0 = Math.floor(fy)
    const y1 = Math.min(r.h - 1, y0 + 1)
    const wy = fy - y0
    for (let x = 0; x < w; x++) {
      const fx = Math.min(r.w - 1, Math.max(0, (x + 0.5) * sx - 0.5))
      const x0 = Math.floor(fx)
      const x1 = Math.min(r.w - 1, x0 + 1)
      const wx = fx - x0
      const i00 = (y0 * r.w + x0) * 4, i01 = (y0 * r.w + x1) * 4
      const i10 = (y1 * r.w + x0) * 4, i11 = (y1 * r.w + x1) * 4
      const o = (y * w + x) * 4
      for (let c = 0; c < 4; c++) {
        const top = src[i00 + c] * (1 - wx) + src[i01 + c] * wx
        const bot = src[i10 + c] * (1 - wx) + src[i11 + c] * wx
        dst[o + c] = top * (1 - wy) + bot * wy
      }
    }
  }
  return out
}

/**
 * 長邊縮到 maxSide（只縮不放）。先整數倍 box filter，餘數再 bilinear，
 * 兼顧速度與抗鋸齒；長邊已 ≤ maxSide 時回傳原物件。
 */
export function resize(r: Raster, maxSide: number): Raster {
  const long = Math.max(r.w, r.h)
  if (long <= maxSide) return r
  const scale = maxSide / long
  const w = Math.max(1, Math.round(r.w * scale))
  const h = Math.max(1, Math.round(r.h * scale))
  let cur = r
  const f = Math.floor(long / maxSide)
  if (f >= 2) cur = downsampleInt(r, f)
  if (cur.w === w && cur.h === h) return cur
  return resampleBilinear(cur, w, h)
}

// ── 灰度 / 梯度 ─────────────────────────────────────────────────────────
/** Rec.601 灰度（0–255 浮點）。 */
export function toGray(r: Raster): Float32Array {
  const n = r.w * r.h
  const g = new Float32Array(n)
  const d = r.data
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    g[i] = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2]
  }
  return g
}

/** Sobel 3×3；邊界像素用 clamp 取樣。gx 向右為正、gy 向下為正。 */
export function sobel(gray: Float32Array, w: number, h: number): { mag: Float32Array; gx: Float32Array; gy: Float32Array } {
  const n = w * h
  const gx = new Float32Array(n)
  const gy = new Float32Array(n)
  const mag = new Float32Array(n)
  for (let y = 0; y < h; y++) {
    const ym = Math.max(0, y - 1) * w
    const y0 = y * w
    const yp = Math.min(h - 1, y + 1) * w
    for (let x = 0; x < w; x++) {
      const xm = Math.max(0, x - 1)
      const xp = Math.min(w - 1, x + 1)
      const tl = gray[ym + xm], tc = gray[ym + x], tr = gray[ym + xp]
      const ml = gray[y0 + xm], mr = gray[y0 + xp]
      const bl = gray[yp + xm], bc = gray[yp + x], br = gray[yp + xp]
      const dx = (tr + 2 * mr + br) - (tl + 2 * ml + bl)
      const dy = (bl + 2 * bc + br) - (tl + 2 * tc + tr)
      const i = y0 + x
      gx[i] = dx
      gy[i] = dy
      mag[i] = Math.hypot(dx, dy)
    }
  }
  return { mag, gx, gy }
}

// ── 裁切 / 旋轉 ─────────────────────────────────────────────────────────
/** 裁切，超出邊界的部分以 clamp 補。 */
export function crop(r: Raster, x: number, y: number, w: number, h: number): Raster {
  const out = createRaster(w, h)
  const src = r.data
  const dst = out.data
  for (let yy = 0; yy < h; yy++) {
    const sy = Math.min(r.h - 1, Math.max(0, y + yy))
    for (let xx = 0; xx < w; xx++) {
      const sx = Math.min(r.w - 1, Math.max(0, x + xx))
      const si = (sy * r.w + sx) * 4
      const di = (yy * w + xx) * 4
      dst[di] = src[si]; dst[di + 1] = src[si + 1]; dst[di + 2] = src[si + 2]; dst[di + 3] = src[si + 3]
    }
  }
  return out
}

/**
 * w×h 矩形繞中心旋轉 deg 後，最大軸對齊內接矩形（同長寬比）；
 * 回傳在「旋轉後影像座標」（與原圖同尺寸、同中心）中的裁切框。
 * Engine 2 用同一框套到另一張 raster 避免洩題。
 */
export function inscribedRect(w: number, h: number, deg: number): { x: number; y: number; w: number; h: number } {
  const a = Math.abs((deg * Math.PI) / 180) % Math.PI
  const t = a > Math.PI / 2 ? Math.PI - a : a
  const s = Math.sin(t), c = Math.cos(t)
  // 保持原長寬比 w:h 的最大內接矩形：縮放係數 k 滿足
  // k·w·c + k·h·s ≤ w 且 k·w·s + k·h·c ≤ h
  const k = Math.min(w / (w * c + h * s), h / (w * s + h * c), 1)
  const cw = Math.max(1, Math.floor(w * k))
  const ch = Math.max(1, Math.floor(h * k))
  return { x: Math.floor((w - cw) / 2), y: Math.floor((h - ch) / 2), w: cw, h: ch }
}

/** 繞中心旋轉 deg（正 = 順時鐘），輸出同尺寸，超界像素填 fill（預設黑）。bilinear。 */
export function rotate(r: Raster, deg: number, fill: [number, number, number, number] = [0, 0, 0, 255]): Raster {
  const { w, h } = r
  const out = createRaster(w, h)
  const src = r.data
  const dst = out.data
  const a = (deg * Math.PI) / 180
  const cos = Math.cos(a), sin = Math.sin(a)
  const cx = (w - 1) / 2, cy = (h - 1) / 2
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // 反向映射：輸出像素 → 來源座標
      const dx = x - cx, dy = y - cy
      const sx = cos * dx + sin * dy + cx
      const sy = -sin * dx + cos * dy + cy
      const o = (y * w + x) * 4
      if (sx < 0 || sy < 0 || sx > w - 1 || sy > h - 1) {
        dst[o] = fill[0]; dst[o + 1] = fill[1]; dst[o + 2] = fill[2]; dst[o + 3] = fill[3]
        continue
      }
      const x0 = Math.floor(sx), y0 = Math.floor(sy)
      const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1)
      const wx = sx - x0, wy = sy - y0
      const i00 = (y0 * w + x0) * 4, i01 = (y0 * w + x1) * 4, i10 = (y1 * w + x0) * 4, i11 = (y1 * w + x1) * 4
      for (let ch = 0; ch < 4; ch++) {
        const top = src[i00 + ch] * (1 - wx) + src[i01 + ch] * wx
        const bot = src[i10 + ch] * (1 - wx) + src[i11 + ch] * wx
        dst[o + ch] = top * (1 - wy) + bot * wy
      }
    }
  }
  return out
}

/** 旋轉 → 裁最大內接矩形 → 縮放回原 w×h。deg=0 為恒等。 */
export function rotateCrop(r: Raster, deg: number): Raster {
  if (deg === 0) return cloneRaster(r)
  const rot = rotate(r, deg)
  const rc = inscribedRect(r.w, r.h, deg)
  const cropped = crop(rot, rc.x, rc.y, rc.w, rc.h)
  return resampleBilinear(cropped, r.w, r.h)
}

// ── 模糊 ────────────────────────────────────────────────────────────────
/** 單通道 box blur（可分離、running-sum，O(n)），passes 次疊加近似高斯。 */
export function boxBlurGray(gray: Float32Array, w: number, h: number, radius: number, passes = 1): Float32Array {
  let src = new Float32Array(gray)
  let tmp = new Float32Array(gray.length)
  const rad = Math.max(0, Math.round(radius))
  if (rad === 0) return src
  const win = 2 * rad + 1
  for (let p = 0; p < passes; p++) {
    // 水平
    for (let y = 0; y < h; y++) {
      const row = y * w
      let sum = 0
      for (let k = -rad; k <= rad; k++) sum += src[row + Math.min(w - 1, Math.max(0, k))]
      for (let x = 0; x < w; x++) {
        tmp[row + x] = sum / win
        const outIdx = Math.max(0, x - rad)
        const inIdx = Math.min(w - 1, x + rad + 1)
        sum += src[row + inIdx] - src[row + outIdx]
      }
    }
    // 垂直
    for (let x = 0; x < w; x++) {
      let sum = 0
      for (let k = -rad; k <= rad; k++) sum += tmp[Math.min(h - 1, Math.max(0, k)) * w + x]
      for (let y = 0; y < h; y++) {
        src[y * w + x] = sum / win
        const outIdx = Math.max(0, y - rad)
        const inIdx = Math.min(h - 1, y + rad + 1)
        sum += tmp[inIdx * w + x] - tmp[outIdx * w + x]
      }
    }
  }
  return src
}

/** RGBA box blur（各通道獨立，alpha 也一起）。 */
export function boxBlurRaster(r: Raster, radius: number, passes = 1): Raster {
  const n = r.w * r.h
  const out = createRaster(r.w, r.h)
  const chan = new Float32Array(n)
  for (let c = 0; c < 4; c++) {
    for (let i = 0; i < n; i++) chan[i] = r.data[i * 4 + c]
    const b = boxBlurGray(chan, r.w, r.h, radius, passes)
    for (let i = 0; i < n; i++) out.data[i * 4 + c] = b[i]
  }
  return out
}

// ── 色彩 ────────────────────────────────────────────────────────────────
/** RGB 0–255 → HSV：h 0–360、s 0–1、v 0–1。 */
export function rgb2hsv(r: number, g: number, b: number): [number, number, number] {
  const rr = r / 255, gg = g / 255, bb = b / 255
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb)
  const d = max - min
  let h = 0
  if (d > 0) {
    if (max === rr) h = 60 * (((gg - bb) / d) % 6)
    else if (max === gg) h = 60 * ((bb - rr) / d + 2)
    else h = 60 * ((rr - gg) / d + 4)
    if (h < 0) h += 360
  }
  const s = max === 0 ? 0 : d / max
  return [h, s, max]
}

/** HSV → RGB 0–255。 */
export function hsv2rgb(h: number, s: number, v: number): [number, number, number] {
  const hh = (((h % 360) + 360) % 360) / 60
  const i = Math.floor(hh)
  const f = hh - i
  const p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f))
  let r = 0, g = 0, b = 0
  switch (i) {
    case 0: r = v; g = t; b = p; break
    case 1: r = q; g = v; b = p; break
    case 2: r = p; g = v; b = t; break
    case 3: r = p; g = q; b = v; break
    case 4: r = t; g = p; b = v; break
    default: r = v; g = p; b = q
  }
  return [r * 255, g * 255, b * 255]
}

// ── 隨機 ────────────────────────────────────────────────────────────────
/** mulberry32：同 seed 序列可重現，回傳 [0,1)。 */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 把任意字串/數字組合成 32-bit seed（FNV-1a），例 hashSeed(imageId, flawId, seed)。 */
export function hashSeed(...parts: (string | number)[]): number {
  let hsh = 0x811c9dc5
  const s = parts.map(String).join('\u0000')
  for (let i = 0; i < s.length; i++) {
    hsh ^= s.charCodeAt(i)
    hsh = Math.imul(hsh, 0x01000193)
  }
  return hsh >>> 0
}
