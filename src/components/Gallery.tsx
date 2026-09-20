import { useEffect, useState } from 'react'
import { useApp, type View, type GalleryEntry } from '../state.ts'
import { CHALLENGE_BY_ID } from '../content/index.ts'
import { PRINCIPLES } from '../content/principles.ts'
import { deletePhoto, getPhoto } from '../lib/photos.ts'
import { CritiqueView } from './photo/AiPanel.tsx'

export function Gallery({ view }: { view: Extract<View, { name: 'gallery' }> }) {
  const gallery = useApp((s) => s.gallery)
  const go = useApp((s) => s.go)
  const entry = view.entryId ? gallery.find((g) => g.id === view.entryId) : undefined
  if (entry) return <EntryView e={entry} />
  const scored = gallery.filter((g) => g.localScore !== undefined).slice().reverse()
  return (
    <>
      <section className="hero">
        <h1 className="hero-title">作品集</h1>
        <p className="hero-sub">{gallery.length ? `${gallery.length} 張。照片只存在這台裝置，記得到設定頁備份。` : '還沒有作品。去「評分」或「每日任務」上傳第一張吧。'}</p>
      </section>
      {scored.length >= 3 && (
        <div className="card">
          <b>本機分數軌跡</b>
          <Spark values={scored.map((g) => g.localScore!)} />
          <div className="tiny">最近 {scored.length} 張，由舊到新。分數是客觀指標參考，看趨勢就好。</div>
        </div>
      )}
      <div className="gallery" style={{ marginTop: 12 }} data-testid="gallery-grid">
        {gallery.map((g) => (
          <button key={g.id} onClick={() => go({ name: 'gallery', entryId: g.id })}>
            <img src={g.thumb} alt="" />
            {g.localScore !== undefined && <span className="sc">{g.localScore}</span>}
          </button>
        ))}
      </div>
    </>
  )
}

function EntryView({ e }: { e: GalleryEntry }) {
  const go = useApp((s) => s.go)
  const removeEntry = useApp((s) => s.removeEntry)
  const updateEntry = useApp((s) => s.updateEntry)
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let u: string | null = null
    void getPhoto(e.photoId).then((b) => { if (b) { u = URL.createObjectURL(b); setUrl(u) } })
    return () => { if (u) URL.revokeObjectURL(u) }
  }, [e.photoId])
  const ch = e.challengeId ? CHALLENGE_BY_ID.get(e.challengeId) : undefined
  return (
    <>
      <button className="back" onClick={() => go({ name: 'gallery' })}>← 作品集</button>
      <div className="preview-wrap" style={{ marginTop: 8 }}>{url ? <img src={url} alt="" /> : <img src={e.thumb} alt="" />}</div>
      <div className="card" style={{ marginTop: 12 }}>
        <div className="tiny">{new Date(e.createdAt).toLocaleString('zh-TW')}{ch && <> · 任務「{ch.title}」（{e.date}）</>}</div>
        <div className="row" style={{ alignItems: 'flex-end', marginTop: 6 }}>
          {e.localScore !== undefined && <div><div className="score-big">{e.localScore}</div><div className="tiny">本機指標</div></div>}
          {e.ai && <div><div className="score-big" style={{ color: 'var(--accent-2)' }}>{e.ai.overall}<span style={{ fontSize: '1rem' }}>/10</span></div><div className="tiny">AI 講評</div></div>}
        </div>
        {e.localHints && e.localHints.length > 0 && (
          <div style={{ marginTop: 8 }}>{e.localHints.map((h, i) => <div key={i} className="hint info"><span><b>{PRINCIPLES[h.principle].name}</b>：{h.text}</span></div>)}</div>
        )}
        <textarea className="textarea" placeholder="筆記：當時想拍什麼、下次想改什麼…" defaultValue={e.note ?? ''} onBlur={(ev) => updateEntry(e.id, { note: ev.target.value })} style={{ marginTop: 10, minHeight: 70 }} />
      </div>
      {e.ai && <div className="card ai-box" style={{ marginTop: 12 }}><CritiqueView c={e.ai} /></div>}
      <div className="row" style={{ marginTop: 14 }}>
        {url && <a className="btn" href={url} download={`photo-dojo-${e.id}.jpg`}>下載原圖</a>}
        <button className="btn ghost" style={{ color: 'var(--bad)' }} onClick={async () => { if (confirm('刪除這張作品？無法復原。')) { await deletePhoto(e.photoId); removeEntry(e.id); go({ name: 'gallery' }) } }}>刪除</button>
      </div>
    </>
  )
}

function Spark({ values }: { values: number[] }) {
  const w = 600, h = 80, pad = 6
  const n = values.length
  const pts = values.map((v, i) => `${pad + (i / Math.max(1, n - 1)) * (w - pad * 2)},${h - pad - (v / 100) * (h - pad * 2)}`)
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline points={pts.join(' ')} fill="none" stroke="var(--accent)" strokeWidth={2} />
      {pts.map((p, i) => { const [x, y] = p.split(',').map(Number); return <circle key={i} cx={x} cy={y} r={3} fill="var(--accent)" /> })}
    </svg>
  )
}
