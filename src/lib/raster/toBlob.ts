// 瀏覽器專用薄 adapter：Raster → canvas / Blob / data URL。不要在 vitest node 測試中 import。
import type { Raster } from './types'

/** 畫到新的 HTMLCanvasElement（要掛進 DOM 或再轉 Blob 都可）。 */
export function rasterToCanvas(r: Raster): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = r.w
  c.height = r.h
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')
  const img = new ImageData(new Uint8ClampedArray(r.data), r.w, r.h)
  ctx.putImageData(img, 0, 0)
  return c
}

/** JPEG Blob（quality 0–1）；type 可改 image/png。 */
export function rasterToBlob(r: Raster, quality = 0.9, type = 'image/jpeg'): Promise<Blob> {
  const c = rasterToCanvas(r)
  return new Promise((resolve, reject) => {
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), type, quality)
  })
}

export function rasterToDataUrl(r: Raster, quality = 0.9, type = 'image/jpeg'): string {
  return rasterToCanvas(r).toDataURL(type, quality)
}
