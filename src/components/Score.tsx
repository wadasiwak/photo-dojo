import { useState } from 'react'
import { useApp, type AiCritique } from '../state.ts'
import { usePhoto, makeThumb } from './photo/usePhoto.ts'
import { UploadBox } from './photo/UploadBox.tsx'
import { PhotoWithOverlay } from './photo/Overlay.tsx'
import { ReportView } from './photo/ReportView.tsx'
import { AiPanel } from './photo/AiPanel.tsx'
import { savePhoto } from '../lib/photos.ts'

export function Score() {
  const { photo, busy, error, load, clear } = usePhoto()
  const [ai, setAi] = useState<AiCritique | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const addEntry = useApp((s) => s.addEntry)
  const updateEntry = useApp((s) => s.updateEntry)
  const go = useApp((s) => s.go)

  const onFile = (f: File) => { setAi(null); setSavedId(null); void load(f) }

  const save = async () => {
    if (!photo) return
    const photoId = await savePhoto(photo.blob)
    const id = crypto.randomUUID().slice(0, 8)
    addEntry({
      id, photoId, thumb: makeThumb(photo.canvas), createdAt: new Date().toISOString(),
      localScore: Math.round(photo.report.overall),
      localHints: photo.report.hints.map((h) => ({ principle: h.principle, text: h.text })),
      ai: ai ?? undefined,
    })
    setSavedId(id)
  }
  const onAi = (c: AiCritique) => { setAi(c); if (savedId) updateEntry(savedId, { ai: c }) }

  return (
    <>
      <section className="hero">
        <h1 className="hero-title">照片評分</h1>
        <p className="hero-sub">先看本機量到的客觀指標（曝光、水平、構圖、色彩、清晰度），想聽人話再請 AI 講評。</p>
      </section>
      {!photo && <UploadBox onFile={onFile} busy={busy} />}
      {error && <p className="error">{error}</p>}
      {photo && (
        <>
          <PhotoWithOverlay url={photo.url} w={photo.w} h={photo.h} saliency={photo.report.saliency} tilt={photo.report.metrics.horizon.confidence >= 0.5 ? photo.report.metrics.horizon.raw.tilt : undefined} />
          <div className="card" style={{ marginTop: 12 }}>
            <ReportView report={photo.report} />
          </div>
          <AiPanel base64={photo.base64} onResult={onAi} />
          <div className="row" style={{ marginTop: 14 }}>
            {savedId ? (
              <button className="btn" onClick={() => go({ name: 'gallery', entryId: savedId })}>✓ 已存進作品集，去看 →</button>
            ) : (
              <button className="btn primary" onClick={save} data-testid="save-entry">存進作品集</button>
            )}
            <button className="btn ghost" onClick={() => { clear(); setAi(null); setSavedId(null) }}>換一張</button>
          </div>
        </>
      )}
      <div className="notice" style={{ marginTop: 20 }}>
        指標怎麼讀：<b>曝光</b>看亮部/暗部有沒有一片死白死黑；<b>水平</b>量地平線傾斜（沒有地平線就會灰掉）；<b>三分構圖</b>量主體離三分點多遠——刻意置中且對稱不扣分；<b>清晰度</b>看主體是否對到焦。分數是「參考」，你的意圖永遠優先。
      </div>
    </>
  )
}
