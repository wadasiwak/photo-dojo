// 瀏覽器專用薄 adapter：影像來源 → Raster（含縮圖）。不要在 vitest node 測試中 import。
import type { Raster } from './types'

type ImageSource = ImageBitmap | HTMLImageElement | HTMLCanvasElement

function sourceSize(src: ImageSource): { w: number; h: number } {
  if (typeof HTMLImageElement !== 'undefined' && src instanceof HTMLImageElement) {
    return { w: src.naturalWidth || src.width, h: src.naturalHeight || src.height }
  }
  return { w: src.width, h: src.height }
}

function makeCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

/** 把圖畫進 canvas 並縮到長邊 ≤ maxSide，讀出 RGBA。 */
export function rasterFromImage(src: ImageSource, maxSide: number): Raster {
  const { w: sw, h: sh } = sourceSize(src)
  const scale = Math.min(1, maxSide / Math.max(sw, sh))
  const w = Math.max(1, Math.round(sw * scale))
  const h = Math.max(1, Math.round(sh * scale))
  const canvas = makeCanvas(w, h)
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null
  if (!ctx) throw new Error('2d context unavailable')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, w, h)
  const img = ctx.getImageData(0, 0, w, h)
  return { w, h, data: new Uint8ClampedArray(img.data) }
}
