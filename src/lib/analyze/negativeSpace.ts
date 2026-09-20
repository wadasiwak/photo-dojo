// 留白：8×8 格中「不忙」的格子比例與最大連通空白區塊。
import type { Hint, MetricResult, NegativeSpaceRaw } from './types'
import { THRESHOLDS } from './thresholds'
import { finalizeScore, lerpScore, percentileSorted, round } from './scoring'

const T = THRESHOLDS.negativeSpace

export function negativeSpace(mag: Float32Array, w: number, h: number): MetricResult<NegativeSpaceRaw> {
  const g = T.grid
  const cells = g * g
  const cellMean = new Float64Array(cells)
  const cellCount = new Float64Array(cells)
  for (let y = 0; y < h; y++) {
    const gy = Math.min(g - 1, Math.floor((y / h) * g))
    for (let x = 0; x < w; x++) {
      const gx = Math.min(g - 1, Math.floor((x / w) * g))
      const c = gy * g + gx
      cellMean[c] += mag[y * w + x]
      cellCount[c]++
    }
  }
  for (let c = 0; c < cells; c++) cellMean[c] = cellCount[c] > 0 ? cellMean[c] / cellCount[c] : 0
  const median = percentileSorted(Float32Array.from(mag).sort(), 50)
  const busyThr = Math.min(Math.max(T.busyFactor * median, T.busyFloor), T.busyAbsolute)
  const empty = new Uint8Array(cells)
  let emptyCount = 0
  for (let c = 0; c < cells; c++) if (cellMean[c] <= busyThr) { empty[c] = 1; emptyCount++ }

  // 4 連通最大空白區塊
  const seen = new Uint8Array(cells)
  let largest = 0
  const stack: number[] = []
  for (let s = 0; s < cells; s++) {
    if (!empty[s] || seen[s]) continue
    let size = 0
    stack.push(s)
    seen[s] = 1
    while (stack.length) {
      const c = stack.pop() as number
      size++
      const cx = c % g, cy = (c - cx) / g
      const nb = [cx > 0 ? c - 1 : -1, cx < g - 1 ? c + 1 : -1, cy > 0 ? c - g : -1, cy < g - 1 ? c + g : -1]
      for (const k of nb) if (k >= 0 && empty[k] && !seen[k]) { seen[k] = 1; stack.push(k) }
    }
    largest = Math.max(largest, size)
  }
  const emptyFraction = emptyCount / cells
  const emptyContiguity = largest / cells

  const hints: Hint[] = []
  if (emptyFraction < T.hintFull) {
    hints.push({ principle: 'negative-space', severity: 'info', text: `畫面約 ${Math.round((1 - emptyFraction) * 100)}% 區域有明顯細節，幾乎沒有留白` })
  } else if (emptyFraction > T.hintEmpty && emptyContiguity > T.hintContig) {
    hints.push({ principle: 'negative-space', severity: 'info', text: `約 ${Math.round(emptyFraction * 100)}% 畫面為平坦區域，其中連成一片的約佔 ${Math.round(emptyContiguity * 100)}%` })
  }
  return {
    raw: { emptyFraction: round(emptyFraction, 3), emptyContiguity: round(emptyContiguity, 3) },
    score: finalizeScore(lerpScore(emptyFraction, T.score)),
    confidence: T.confidence,
    hints,
  }
}
