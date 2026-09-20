import type { LocalReport, MetricKey, MetricResult } from '../../lib/analyze/types.ts'
import { PRINCIPLES, type PrincipleId } from '../../content/principles.ts'
import { LESSONS } from '../../content/index.ts'
import { useApp } from '../../state.ts'

const METRIC_LABEL: Record<MetricKey, string> = {
  exposure: '曝光', thirds: '三分構圖', horizon: '水平', negativeSpace: '留白', leadingLines: '引導線',
  colorHarmony: '色彩', sharpness: '清晰度', noise: '雜訊', symmetry: '對稱',
}
const ORDER: MetricKey[] = ['exposure', 'sharpness', 'thirds', 'horizon', 'colorHarmony', 'negativeSpace', 'leadingLines', 'noise', 'symmetry']

export function lessonForPrinciple(p: PrincipleId) {
  return LESSONS.find((l) => l.relatedPrinciples[0] === p) ?? LESSONS.find((l) => l.relatedPrinciples.includes(p))
}

function rawLine(key: MetricKey, m: MetricResult): string {
  const r = m.raw as Record<string, number>
  switch (key) {
    case 'exposure': return `亮部 ${r.clipHigh.toFixed(1)}% · 暗部 ${r.clipLow.toFixed(1)}% · 中位 ${Math.round(r.median)}`
    case 'thirds': return `距三分點 ${(r.dThirds * 100).toFixed(0)}% · 距中心 ${(r.dCenter * 100).toFixed(0)}%`
    case 'horizon': return `傾斜 ${r.tilt.toFixed(1)}°`
    case 'negativeSpace': return `空白 ${(r.emptyFraction * 100).toFixed(0)}%`
    case 'leadingLines': return `${r.lineCount} 條線${r.convergent ? ' · 匝聚' : ''}`
    case 'colorHarmony': return `飽和 ${(r.meanSat * 100).toFixed(0)}% · 色偏 ${r.castMagnitude.toFixed(0)}`
    case 'sharpness': return `銳利 ${r.sharp.toFixed(3)}`
    case 'noise': return `σ ${r.noiseSigma.toFixed(1)}`
    case 'symmetry': return `對稱 ${(r.symmetry * 100).toFixed(0)}%`
  }
}

export function ReportView({ report, compact = false }: { report: LocalReport; compact?: boolean }) {
  const go = useApp((s) => s.go)
  return (
    <div data-testid="local-report">
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div className="score-big" data-testid="local-score">{Math.round(report.overall)}</div>
        <div>
          <div><b>本機客觀指標</b></div>
          <div className="tiny">量測值參考，不是美感判決。灰色＝這張照片該指標判讀信心低（例如沒有地平線）。</div>
        </div>
      </div>
      {!compact && (
        <div className="score-grid">
          {ORDER.map((k) => {
            const m = report.metrics[k] as MetricResult
            const low = m.confidence < 0.3
            return (
              <div key={k} className={`metric ${low ? 'low' : ''}`} title={low ? '判讀信心低' : ''}>
                <div className="name"><span>{METRIC_LABEL[k]}</span>{low && <span>參考</span>}</div>
                <div className="val">{Math.round(m.score)}</div>
                <div className="bar"><i style={{ width: `${m.score}%` }} /></div>
                <div className="tiny">{rawLine(k, m)}</div>
                {k === 'colorHarmony' && (
                  <div className="palette">{report.metrics.colorHarmony.palette.slice(0, 5).map((c, i) => <i key={i} style={{ background: c }} />)}</div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {report.hints.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {report.hints.map((h, i) => {
            const lesson = lessonForPrinciple(h.principle)
            return (
              <div key={i} className={`hint ${h.severity}`}>
                <span>{h.severity === 'warn' ? '⚠️' : 'ℹ️'}</span>
                <span style={{ flex: 1 }}><b>{PRINCIPLES[h.principle].name}</b>：{h.text}</span>
                {lesson && <button onClick={() => go({ name: 'learn', chapter: lesson.chapter, lessonId: lesson.id })}>看課 →</button>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
