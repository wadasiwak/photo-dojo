// 合成圖 fixtures：所有 Engine 1 測試都用這裡產的 Raster，不依賴任何真圖或 canvas。
import { createRaster, rng } from '../../raster'
import type { Raster } from '../../raster'

export type RGB = [number, number, number]

function put(r: Raster, i: number, rgb: RGB): void {
  const o = i * 4
  r.data[o] = rgb[0]
  r.data[o + 1] = rgb[1]
  r.data[o + 2] = rgb[2]
  r.data[o + 3] = 255
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

/** 單色圖。 */
export function flat(w: number, h: number, rgb: RGB | number): Raster {
  const c: RGB = typeof rgb === 'number' ? [rgb, rgb, rgb] : rgb
  return createRaster(w, h, [c[0], c[1], c[2], 255])
}

/** 0→255 灰階線性漸層；dir 'h' 由左到右、'v' 由上到下。 */
export function gradient(w: number, h: number, dir: 'h' | 'v' = 'h'): Raster {
  const r = createRaster(w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = dir === 'h' ? x / (w - 1) : y / (h - 1)
      const v = t * 255
      put(r, y * w + x, [v, v, v])
    }
  }
  return r
}

/** 左右鏡像的漸層（中央亮、兩側暗），用來測對稱。 */
export function mirrorGradient(w: number, h: number): Raster {
  const r = createRaster(w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = 1 - Math.abs(x - (w - 1) / 2) / ((w - 1) / 2)
      const v = 30 + t * 200
      put(r, y * w + x, [v, v, v])
    }
  }
  return r
}

/**
 * 雙色「地平線」：線通過中心、傾斜 deg（正 = 順時鐘、右側較低），
 * 上方 rgbAbove、下方 rgbBelow；thickness 為過渡帶寬（px，做抗鋸齒，>=1）。
 */
export function tiltedLine(w: number, h: number, deg: number, thickness: number, rgbAbove: RGB, rgbBelow: RGB): Raster {
  const r = createRaster(w, h)
  const a = (deg * Math.PI) / 180
  // 線方向 (cos a, sin a)；法向 (−sin a, cos a) 指向「下方」
  const nx = -Math.sin(a), ny = Math.cos(a)
  const cx = (w - 1) / 2, cy = (h - 1) / 2
  const half = Math.max(0.5, thickness / 2)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = (x - cx) * nx + (y - cy) * ny // 正 = 線下方
      const t = Math.min(1, Math.max(0, (d + half) / (2 * half)))
      put(r, y * w + x, mix(rgbAbove, rgbBelow, t))
    }
  }
  return r
}

/** 在既有圖上畫抗鋸齒圓；cx, cy 為 w/h 比例，rad 為 min(w,h) 比例。 */
export function paintDisc(r: Raster, cx: number, cy: number, rad: number, rgb: RGB): Raster {
  const { w, h } = r
  const px = cx * w, py = cy * h, pr = rad * Math.min(w, h)
  const x0 = Math.max(0, Math.floor(px - pr - 1)), x1 = Math.min(w - 1, Math.ceil(px + pr + 1))
  const y0 = Math.max(0, Math.floor(py - pr - 1)), y1 = Math.min(h - 1, Math.ceil(py + pr + 1))
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - px, y + 0.5 - py) - pr
      const cov = Math.min(1, Math.max(0, 0.5 - d))
      if (cov <= 0) continue
      const i = y * w + x
      const o = i * 4
      const cur: RGB = [r.data[o], r.data[o + 1], r.data[o + 2]]
      put(r, i, mix(cur, rgb, cov))
    }
  }
  return r
}

/** 單色背景上的一個圓。 */
export function disc(w: number, h: number, cx: number, cy: number, rad: number, rgb: RGB, bg: RGB | number): Raster {
  return paintDisc(flat(w, h, bg), cx, cy, rad, rgb)
}

/** 黑白棋盤格。 */
export function checker(w: number, h: number, cell: number): Raster {
  const r = createRaster(w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const on = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0
      const v = on ? 255 : 0
      put(r, y * w + x, [v, v, v])
    }
  }
  return r
}

/** 黑白條紋，angle 為條紋方向（度）、period 為一黑一白週期（px）。 */
export function stripes(w: number, h: number, angle: number, period: number): Raster {
  const r = createRaster(w, h)
  const a = (angle * Math.PI) / 180
  const nx = -Math.sin(a), ny = Math.cos(a)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = x * nx + y * ny
      const v = ((Math.floor(d / (period / 2)) % 2) + 2) % 2 === 0 ? 255 : 0
      put(r, y * w + x, [v, v, v])
    }
  }
  return r
}

/** 在既有圖上畫一條抗鋸齒直線（座標為 w/h 比例）。 */
export function drawLine(r: Raster, x0: number, y0: number, x1: number, y1: number, thickness: number, rgb: RGB): Raster {
  const { w, h } = r
  const ax = x0 * w, ay = y0 * h, bx = x1 * w, by = y1 * h
  const dx = bx - ax, dy = by - ay
  const len2 = dx * dx + dy * dy || 1
  const half = thickness / 2
  const minX = Math.max(0, Math.floor(Math.min(ax, bx) - half - 1)), maxX = Math.min(w - 1, Math.ceil(Math.max(ax, bx) + half + 1))
  const minY = Math.max(0, Math.floor(Math.min(ay, by) - half - 1)), maxY = Math.min(h - 1, Math.ceil(Math.max(ay, by) + half + 1))
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5, py = y + 0.5
      let t = ((px - ax) * dx + (py - ay) * dy) / len2
      t = Math.min(1, Math.max(0, t))
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) - half
      const cov = Math.min(1, Math.max(0, 0.5 - d))
      if (cov <= 0) continue
      const i = y * w + x
      const o = i * 4
      const cur: RGB = [r.data[o], r.data[o + 1], r.data[o + 2]]
      put(r, i, mix(cur, rgb, cov))
    }
  }
  return r
}

/** 直向色塊拼貼（等寬），測色彩分散。 */
export function blocks(w: number, h: number, colors: RGB[]): Raster {
  const r = createRaster(w, h)
  const n = colors.length
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      put(r, y * w + x, colors[Math.min(n - 1, Math.floor((x / w) * n))])
    }
  }
  return r
}

/** 每像素獨立均勻隨機灰階。 */
export function randomGray(w: number, h: number, seed = 1): Raster {
  const r = createRaster(w, h)
  const rand = rng(seed)
  for (let i = 0; i < w * h; i++) {
    const v = rand() * 255
    put(r, i, [v, v, v])
  }
  return r
}

/** 加亮度高斯雜訊（Box-Muller，三通道同值），回傳新圖。 */
export function addGaussianNoise(r: Raster, sigma: number, seed = 1): Raster {
  const out = createRaster(r.w, r.h)
  const rand = rng(seed)
  const n = r.w * r.h
  for (let i = 0; i < n; i++) {
    const u1 = Math.max(1e-12, rand()), u2 = rand()
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * sigma
    const o = i * 4
    out.data[o] = r.data[o] + z
    out.data[o + 1] = r.data[o + 1] + z
    out.data[o + 2] = r.data[o + 2] + z
    out.data[o + 3] = 255
  }
  return out
}

/** 慢速可分離高斯模糊參考實作（邊界 clamp）。 */
export function gaussianBlurRef(r: Raster, sigma: number): Raster {
  const rad = Math.ceil(sigma * 3)
  const k = new Float64Array(2 * rad + 1)
  let s = 0
  for (let i = -rad; i <= rad; i++) {
    k[i + rad] = Math.exp(-(i * i) / (2 * sigma * sigma))
    s += k[i + rad]
  }
  for (let i = 0; i < k.length; i++) k[i] /= s
  const { w, h } = r
  const tmp = new Float64Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 4; c++) {
        let acc = 0
        for (let i = -rad; i <= rad; i++) {
          const xx = Math.min(w - 1, Math.max(0, x + i))
          acc += k[i + rad] * r.data[(y * w + xx) * 4 + c]
        }
        tmp[(y * w + x) * 4 + c] = acc
      }
    }
  }
  const out = createRaster(w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 4; c++) {
        let acc = 0
        for (let i = -rad; i <= rad; i++) {
          const yy = Math.min(h - 1, Math.max(0, y + i))
          acc += k[i + rad] * tmp[(yy * w + x) * 4 + c]
        }
        out.data[(y * w + x) * 4 + c] = acc
      }
    }
  }
  return out
}
