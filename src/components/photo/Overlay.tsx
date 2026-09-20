import { useState, type ReactNode } from 'react'
import type { Saliency } from '../../lib/analyze/types.ts'

export type OverlayKind = 'none' | 'thirds' | 'spiral' | 'diagonal' | 'center'
const KINDS: Array<[OverlayKind, string]> = [['none', '無'], ['thirds', '三分線'], ['spiral', '黃金螺旋'], ['diagonal', '對角線'], ['center', '中心十字']]
const STROKE = 'rgba(255,255,255,0.75)'

/** 照片預覽 + 構圖輔助疊圖 + 主體質心點 + 量到的地平線傾斜 */
export function PhotoWithOverlay({ url, w, h, saliency, tilt }: { url: string; w: number; h: number; saliency?: Saliency; tilt?: number }) {
  const [kind, setKind] = useState<OverlayKind>('thirds')
  const [flip, setFlip] = useState(0)
  const [showCentroid, setShowCentroid] = useState(true)
  const lines: ReactNode[] = []
  if (kind === 'thirds') {
    for (const f of [1 / 3, 2 / 3]) {
      lines.push(<line key={`v${f}`} x1={w * f} y1={0} x2={w * f} y2={h} stroke={STROKE} strokeWidth={1.5} />)
      lines.push(<line key={`h${f}`} x1={0} y1={h * f} x2={w} y2={h * f} stroke={STROKE} strokeWidth={1.5} />)
    }
  } else if (kind === 'diagonal') {
    lines.push(<line key="d1" x1={0} y1={0} x2={w} y2={h} stroke={STROKE} strokeWidth={1.5} />)
    lines.push(<line key="d2" x1={w} y1={0} x2={0} y2={h} stroke={STROKE} strokeWidth={1.5} />)
    lines.push(<line key="d3" x1={0} y1={h} x2={Math.min(w, h)} y2={h - Math.min(w, h)} stroke={STROKE} strokeWidth={1} strokeDasharray="6 6" />)
    lines.push(<line key="d4" x1={w} y1={0} x2={w - Math.min(w, h)} y2={Math.min(w, h)} stroke={STROKE} strokeWidth={1} strokeDasharray="6 6" />)
  } else if (kind === 'center') {
    lines.push(<line key="c1" x1={w / 2} y1={0} x2={w / 2} y2={h} stroke={STROKE} strokeWidth={1.5} />)
    lines.push(<line key="c2" x1={0} y1={h / 2} x2={w} y2={h / 2} stroke={STROKE} strokeWidth={1.5} />)
    lines.push(<circle key="c3" cx={w / 2} cy={h / 2} r={Math.min(w, h) * 0.12} stroke={STROKE} fill="none" strokeWidth={1.5} />)
  } else if (kind === 'spiral') {
    lines.push(<path key="sp" d={goldenSpiralPath(w, h, flip)} stroke={STROKE} fill="none" strokeWidth={1.5} />)
  }
  const showTilt = tilt !== undefined && Math.abs(tilt) > 0.7
  const dy = showTilt ? Math.tan((tilt! * Math.PI) / 180) * (w / 2) : 0
  return (
    <div>
      <div className="preview-wrap">
        <img src={url} alt="上傳的照片" />
        <svg className="overlay" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
          {lines}
          {showTilt && <line x1={0} y1={h / 2 + dy} x2={w} y2={h / 2 - dy} stroke="rgba(240,179,90,0.9)" strokeWidth={2} strokeDasharray="8 6" />}
          {showCentroid && saliency && saliency.mass > 1.3 && (
            <>
              <circle cx={saliency.cx * w} cy={saliency.cy * h} r={Math.min(w, h) * 0.035} fill="rgba(240,179,90,0.25)" stroke="#f0b35a" strokeWidth={2} />
              <rect x={saliency.bbox.x0 * w} y={saliency.bbox.y0 * h} width={(saliency.bbox.x1 - saliency.bbox.x0) * w} height={(saliency.bbox.y1 - saliency.bbox.y0) * h} stroke="rgba(240,179,90,0.5)" strokeDasharray="6 4" fill="none" strokeWidth={1.5} />
            </>
          )}
        </svg>
      </div>
      <div className="overlay-ctl" data-testid="overlay-ctl">
        {KINDS.map(([k, label]) => (
          <button key={k} className={kind === k ? 'active' : ''} data-kind={k} onClick={() => (k === 'spiral' && kind === 'spiral' ? setFlip((f) => (f + 1) % 4) : setKind(k))}>
            {label}{k === 'spiral' && kind === 'spiral' ? ' ↻' : ''}
          </button>
        ))}
        {saliency && <button className={showCentroid ? 'active' : ''} onClick={() => setShowCentroid((v) => !v)}>主體點</button>}
      </div>
    </div>
  )
}

/**
 * 黃金螺旋：先在畫面內取最大的黃金矩形（置中），再依 左→上→右→下 循環切正方形、每格畫四分之一圓弧。
 * 弧心永遠是正方形的「內角」（朝螺旋眼的那個角）。flip 位元 1 = 左右鏡射、2 = 上下鏡射（四個方向）。
 */
export function goldenSpiralPath(W: number, H: number, flip: number): string {
  const phi = (1 + Math.sqrt(5)) / 2
  let x: number, y: number, w: number, h: number
  if (W / H >= phi) { h = H; w = H * phi; x = (W - w) / 2; y = 0 }
  else { w = W; h = W / phi; x = 0; y = (H - h) / 2 }
  type P = { x: number; y: number }
  const arcs: Array<{ s: P; e: P; r: number }> = []
  for (let k = 0; k < 9 && Math.min(w, h) > 1; k++) {
    const side = k % 4
    if (side === 0) { const s = h; arcs.push({ s: { x, y: y + s }, e: { x: x + s, y }, r: s }); x += s; w -= s }
    else if (side === 1) { const s = w; arcs.push({ s: { x, y }, e: { x: x + s, y: y + s }, r: s }); y += s; h -= s }
    else if (side === 2) { const s = h; const sx = x + w - s; arcs.push({ s: { x: sx + s, y }, e: { x: sx, y: y + s }, r: s }); w -= s }
    else { const s = w; const sy = y + h - s; arcs.push({ s: { x: x + s, y: sy + s }, e: { x, y: sy }, r: s }); h -= s }
  }
  const tf = (p: P): P => ({ x: flip & 1 ? W - p.x : p.x, y: flip & 2 ? H - p.y : p.y })
  const sweep = (flip === 1 || flip === 2) ? 0 : 1
  const f = (n: number) => n.toFixed(1)
  let d = ''
  arcs.forEach((a, i) => {
    const s = tf(a.s), e = tf(a.e)
    if (i === 0) d += `M${f(s.x)},${f(s.y)}`
    d += ` A${f(a.r)},${f(a.r)} 0 0 ${sweep} ${f(e.x)},${f(e.y)}`
  })
  return d
}
