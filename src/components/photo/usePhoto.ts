import { useCallback, useEffect, useRef, useState } from 'react'
import { compressPhoto } from '../../lib/vision.ts'
import { analyze } from '../../lib/analyze/index.ts'
import type { LocalReport } from '../../lib/analyze/types.ts'
import { rasterFromImage } from '../../lib/raster/fromImage.ts'

export interface LoadedPhoto {
  url: string
  base64: string
  blob: Blob
  canvas: HTMLCanvasElement
  report: LocalReport
  w: number
  h: number
}

/** 上傳 → 壓縮（EXIF 轉正、長邊 1280）→ 本機分析。 */
export function usePhoto() {
  const [photo, setPhoto] = useState<LoadedPhoto | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const urlRef = useRef<string | null>(null)

  const load = useCallback(async (file: File | Blob) => {
    setBusy(true)
    setError(null)
    try {
      const { base64, blob, canvas } = await compressPhoto(file, 1280)
      const raster = rasterFromImage(canvas, 480)
      const report = analyze(raster)
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      const url = URL.createObjectURL(blob)
      urlRef.current = url
      setPhoto({ url, base64, blob, canvas, report, w: canvas.width, h: canvas.height })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [])

  const clear = useCallback(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = null
    setPhoto(null)
  }, [])

  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current) }, [])

  return { photo, busy, error, load, clear }
}

/** 產 240px 縮圖 dataURL（作品牆用） */
export function makeThumb(canvas: HTMLCanvasElement, size = 240): string {
  const s = Math.min(1, size / Math.max(canvas.width, canvas.height))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(canvas.width * s))
  c.height = Math.max(1, Math.round(canvas.height * s))
  c.getContext('2d')!.drawImage(canvas, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.7)
}
