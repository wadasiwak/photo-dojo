import { useState } from 'react'
import { useApp, type View, type AiCritique } from '../state.ts'
import { PRINCIPLES } from '../content/principles.ts'
import { pickDailyChallenge, shiftDate } from '../lib/daily.ts'
import { todayStr } from '../lib/seed.ts'
import { usePhoto, makeThumb } from './photo/usePhoto.ts'
import { UploadBox } from './photo/UploadBox.tsx'
import { PhotoWithOverlay } from './photo/Overlay.tsx'
import { ReportView } from './photo/ReportView.tsx'
import { AiPanel } from './photo/AiPanel.tsx'
import { savePhoto } from '../lib/photos.ts'
import { lessonForPrinciple } from './photo/ReportView.tsx'

export function Daily({ view }: { view: Extract<View, { name: 'daily' }> }) {
  const go = useApp((s) => s.go)
  const today = todayStr()
  const date = view.date ?? today
  const ch = pickDailyChallenge(date)
  const gallery = useApp((s) => s.gallery)
  const addEntry = useApp((s) => s.addEntry)
  const updateEntry = useApp((s) => s.updateEntry)
  const submissions = gallery.filter((g) => g.date === date && g.challengeId === ch.id)
  const { photo, busy, error, load, clear } = usePhoto()
  const [ai, setAi] = useState<AiCritique | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const isFuture = date > today

  const save = async () => {
    if (!photo) return
    const photoId = await savePhoto(photo.blob)
    const id = crypto.randomUUID().slice(0, 8)
    addEntry({
      id, photoId, thumb: makeThumb(photo.canvas), createdAt: new Date().toISOString(), challengeId: ch.id, date,
      localScore: Math.round(photo.report.overall),
      localHints: photo.report.hints.map((h) => ({ principle: h.principle, text: h.text })),
      ai: ai ?? undefined,
    })
    setSavedId(id)
  }
  const onAi = (c: AiCritique) => { setAi(c); if (savedId) updateEntry(savedId, { ai: c }) }
  const streak = countStreak(gallery.filter((g) => g.challengeId).map((g) => g.date!), today)

  return (
    <>
      <section className="hero">
        <h1 className="hero-title">每日拍照任務</h1>
        <p className="hero-sub">日期決定題目，全世界同一天同一題。交作業進作品集，一個月後回頭看分數。{streak > 0 && <> 🔥 連續 {streak} 天</>}</p>
      </section>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <button className="btn small ghost" onClick={() => go({ name: 'daily', date: shiftDate(date, -1) })}>← 前一天</button>
        <b data-testid="daily-date">{date}{date === today ? '（今天）' : ''}</b>
        <button className="btn small ghost" onClick={() => go({ name: 'daily', date: shiftDate(date, 1) })} disabled={isFuture || date >= today}>後一天 →</button>
      </div>
      <div className="card daily-card" style={{ marginTop: 10 }} data-testid="daily-challenge">
        <div className="tiny">{'★'.repeat(ch.difficulty)}{'☆'.repeat(3 - ch.difficulty)} · {ch.indoorOk ? '室內可完成' : '需要出門'}</div>
        <h2 style={{ margin: '4px 0' }}>{ch.title}</h2>
        <p>{ch.brief}</p>
        <ul style={{ margin: '0 0 8px', paddingLeft: '1.2em' }}>{ch.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
        <div>
          {ch.principles.map((p) => {
            const l = lessonForPrinciple(p)
            return <button key={p} className="tag accent" style={{ cursor: 'pointer' }} onClick={() => l && go({ name: 'learn', chapter: l.chapter, lessonId: l.id })}>{PRINCIPLES[p].emoji} {PRINCIPLES[p].name} →</button>
          })}
        </div>
      </div>

      {submissions.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <b>這天已交 {submissions.length} 張</b>
          <div className="gallery" style={{ marginTop: 8 }}>
            {submissions.map((g) => (
              <button key={g.id} onClick={() => go({ name: 'gallery', entryId: g.id })}><img src={g.thumb} alt="" />{g.localScore !== undefined && <span className="sc">{g.localScore}</span>}</button>
            ))}
          </div>
        </div>
      )}

      <h2 className="section-title">交作業</h2>
      {!photo && <UploadBox onFile={(f) => { setAi(null); setSavedId(null); void load(f) }} busy={busy} label="拍好了？上傳這題的照片" />}
      {error && <p className="error">{error}</p>}
      {photo && (
        <>
          <PhotoWithOverlay url={photo.url} w={photo.w} h={photo.h} saliency={photo.report.saliency} tilt={photo.report.metrics.horizon.confidence >= 0.5 ? photo.report.metrics.horizon.raw.tilt : undefined} />
          <div className="card" style={{ marginTop: 12 }}><ReportView report={photo.report} compact /></div>
          <AiPanel base64={photo.base64} onResult={onAi} />
          <div className="row" style={{ marginTop: 14 }}>
            {savedId ? <button className="btn" onClick={() => go({ name: 'gallery', entryId: savedId })}>✓ 已交，去作品集 →</button> : <button className="btn primary" onClick={save} data-testid="daily-save">交這張當作業</button>}
            <button className="btn ghost" onClick={() => { clear(); setAi(null); setSavedId(null) }}>換一張</button>
          </div>
        </>
      )}
    </>
  )
}

function countStreak(dates: string[], today: string): number {
  const set = new Set(dates)
  let d = today
  let n = 0
  if (!set.has(d)) d = shiftDate(d, -1)
  while (set.has(d)) { n++; d = shiftDate(d, -1) }
  return n
}
