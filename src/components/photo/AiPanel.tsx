import { useState } from 'react'
import { useApp, type AiCritique } from '../../state.ts'
import { buildExternalPrompt, copyText, critiquePhoto, getApiKey, parseCritiqueJson, type CritiqueOutcome } from '../../lib/vision.ts'
import { PRINCIPLES } from '../../content/principles.ts'
import { lessonForPrinciple } from './ReportView.tsx'

export function CritiqueView({ c }: { c: AiCritique }) {
  const go = useApp((s) => s.go)
  return (
    <div data-testid="ai-critique">
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div className="score-big" style={{ color: 'var(--accent-2)' }}>{c.overall}<span style={{ fontSize: '1rem', color: 'var(--text-3)' }}>/10</span></div>
        <div><div><b>{c.subject || '主體'}</b></div><div className="muted">{c.mood}</div></div>
      </div>
      {c.strengths.length > 0 && (<><h4 style={{ margin: '12px 0 4px', color: 'var(--ok)' }}>👍 做得好</h4><ul style={{ margin: 0, paddingLeft: '1.2em' }}>{c.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></>)}
      {c.improvements.length > 0 && (
        <>
          <h4 style={{ margin: '12px 0 4px', color: 'var(--warn)' }}>🔧 下次可以</h4>
          {c.improvements.map((im, i) => {
            const lesson = lessonForPrinciple(im.principle)
            return (
              <div key={i} className="hint warn">
                <span style={{ flex: 1 }}><b>{PRINCIPLES[im.principle].name}</b>：{im.text}</span>
                {lesson && <button onClick={() => go({ name: 'learn', chapter: lesson.chapter, lessonId: lesson.id })}>看課 →</button>}
              </div>
            )
          })}
        </>
      )}
      {c.nextShot && <p style={{ marginTop: 12 }}><b>📷 下一張：</b>{c.nextShot}</p>}
      <div className="tiny">講評模型：{c.model}</div>
    </div>
  )
}

/** AI 講評面板：有 key 走 API；沒 key 給免費外包鍵（複製指令＋照片貼任意 LLM，貼回 JSON） */
export function AiPanel({ base64, onResult, initial }: { base64: string; onResult: (c: AiCritique) => void; initial?: AiCritique }) {
  const go = useApp((s) => s.go)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<AiCritique | null>(initial ?? null)
  const [err, setErr] = useState<string | null>(null)
  const [showExternal, setShowExternal] = useState(false)
  const hasKey = !!getApiKey() || !!window.__mockVision

  const handle = (o: CritiqueOutcome) => {
    if (o.ok) { setResult(o.critique); onResult(o.critique); setErr(null) }
    else { setErr(o.message); if (o.kind === 'no-key' || o.kind === 'offline') setShowExternal(true) }
  }
  const run = async () => { setBusy(true); try { handle(await critiquePhoto(base64)) } finally { setBusy(false) } }

  return (
    <div className="card ai-box" style={{ marginTop: 12 }}>
      <h3 style={{ margin: 0 }}>🤖 AI 講評</h3>
      <p className="tiny" style={{ margin: '4px 0 10px' }}>本機指標只會量，AI 才會看懂「你想拍什麼」。兩條路都免費：自備金鑰直接講評，或把指令＋照片貼給任何 AI。</p>
      {result ? (
        <>
          <CritiqueView c={result} />
          <div className="row" style={{ marginTop: 10 }}>
            {hasKey && <button className="btn small" onClick={run} disabled={busy}>{busy ? <span className="spinner" /> : '再評一次'}</button>}
            <button className="btn small ghost" onClick={() => setShowExternal((v) => !v)}>用其他 AI 講評</button>
          </div>
        </>
      ) : (
        <div className="row">
          {hasKey ? (
            <button className="btn primary" onClick={run} disabled={busy} data-testid="ai-run">{busy ? <><span className="spinner" /> 講評中…</> : '請 Claude 講評這張'}</button>
          ) : (
            <button className="btn" onClick={() => go({ name: 'settings' })}>設定金鑰後直接講評</button>
          )}
          <button className={`btn ${hasKey ? 'ghost' : 'primary'}`} onClick={() => setShowExternal((v) => !v)} data-testid="ai-external-toggle">免費：貼給 ChatGPT / Gemini 講評</button>
        </div>
      )}
      {err && <p className="error" style={{ marginTop: 8 }}>{err}</p>}
      {showExternal && <ExternalPanel onParsed={handle} />}
    </div>
  )
}

function ExternalPanel({ onParsed }: { onParsed: (o: CritiqueOutcome) => void }) {
  const [copied, setCopied] = useState<boolean | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [pasted, setPasted] = useState('')
  const prompt = buildExternalPrompt()
  return (
    <div style={{ marginTop: 12 }} data-testid="external-panel">
      <ol className="steps">
        <li>按「複製講評指令」，到 ChatGPT / Gemini / Claude 任一 App 貼上，<b>並附上這張照片</b>。</li>
        <li>把 AI 回覆的整段文字全選複製。</li>
        <li>貼到下面框框，按「解析」。</li>
      </ol>
      <div className="row">
        <button className="btn small" data-testid="copy-prompt" onClick={async () => { const ok = await copyText(prompt); setCopied(ok); if (!ok) setShowPrompt(true) }}>
          📋 複製講評指令
        </button>
        {copied === true && <span className="pill ok">已複製</span>}
        {copied === false && <span className="pill warn">無法自動複製，請手動全選下面文字</span>}
        <button className="btn small ghost" onClick={() => setShowPrompt((v) => !v)}>{showPrompt ? '收起指令' : '看指令內容'}</button>
      </div>
      {showPrompt && <textarea className="textarea" readOnly value={prompt} onFocus={(e) => e.target.select()} style={{ marginTop: 8, minHeight: 160 }} />}
      <textarea className="textarea" placeholder="把 AI 的回覆貼在這裡…" value={pasted} onChange={(e) => setPasted(e.target.value)} style={{ marginTop: 10 }} data-testid="paste-box" />
      <button className="btn small primary" style={{ marginTop: 8 }} disabled={!pasted.trim()} onClick={() => onParsed(parseCritiqueJson(pasted))} data-testid="parse-btn">解析並顯示講評</button>
    </div>
  )
}
