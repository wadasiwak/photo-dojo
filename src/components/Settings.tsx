import { useState } from 'react'
import { useApp } from '../state.ts'
import { getApiKey, setApiKey, testApiKey } from '../lib/vision.ts'
import { allPhotos, blobToDataUrl, clearAllPhotos, dataUrlToBlob, savePhoto } from '../lib/photos.ts'
import { todayStr } from '../lib/seed.ts'

export function Settings() {
  const [key, setKey] = useState(getApiKey())
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const model = useApp((s) => s.visionModel)
  const setModel = useApp((s) => s.setVisionModel)
  const st = useApp()
  const importState = useApp((s) => s.importState)
  const resetAll = useApp((s) => s.resetAll)

  const exportLight = () => download(`photo-dojo-backup-${todayStr()}.json`, JSON.stringify({ v: 1, lessonsDone: st.lessonsDone, checklist: st.checklist, srs: st.srs, quiz: st.quiz, gallery: st.gallery }))
  const exportFull = async () => {
    const photos = await allPhotos()
    const enc = await Promise.all(photos.map(async (p) => ({ id: p.id, data: await blobToDataUrl(p.blob) })))
    download(`photo-dojo-backup-full-${todayStr()}.json`, JSON.stringify({ v: 1, lessonsDone: st.lessonsDone, checklist: st.checklist, srs: st.srs, quiz: st.quiz, gallery: st.gallery, photos: enc }))
  }
  const onImport = async (f: File) => {
    try {
      const j = JSON.parse(await f.text()) as { v?: number; photos?: Array<{ id: string; data: string }>; gallery?: unknown } & Record<string, unknown>
      if (j.v !== 1) throw new Error('不是本站備份檔')
      if (Array.isArray(j.photos)) for (const p of j.photos) await savePhoto(await dataUrlToBlob(p.data), p.id)
      importState(j as Parameters<typeof importState>[0])
      setMsg('匯入完成')
    } catch (e) { setMsg(`匯入失敗：${e instanceof Error ? e.message : String(e)}`) }
  }

  return (
    <div className="settings">
      <section className="hero"><h1 className="hero-title">設定</h1><p className="hero-sub">金鑰只存這台裝置的瀏覽器，不進備份檔。</p></section>
      <div className="card">
        <h3>🤖 AI 講評金鑰（Anthropic）</h3>
        <p className="muted">到 <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer">console.anthropic.com</a> 建立 API key（需綁信用卡，講評一張約 NT$0.3–0.5）。沒有金鑰也能用免費的「貼給 ChatGPT 講評」。</p>
        <label>API key</label>
        <input className="input" type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-ant-…" autoComplete="off" data-testid="api-key" />
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn primary" onClick={() => { setApiKey(key); setMsg(key.trim() ? '已儲存' : '已清除') }}>儲存</button>
          <button className="btn" disabled={!key.trim() || busy} onClick={async () => { setBusy(true); const r = await testApiKey(key); setMsg(r.message); setBusy(false) }}>{busy ? <span className="spinner" /> : '測試連線'}</button>
          {key && <button className="btn ghost" onClick={() => { setKey(''); setApiKey(''); setMsg('已清除') }}>清除</button>}
        </div>
        <label>講評模型</label>
        <div className="seg">
          <button className={model === 'precise' ? 'active' : ''} onClick={() => setModel('precise')}>精準（Sonnet，推薦）</button>
          <button className={model === 'fast' ? 'active' : ''} onClick={() => setModel('fast')}>快省（Haiku）</button>
        </div>
        {msg && <p className="muted" style={{ marginTop: 10 }}>{msg}</p>}
      </div>
      <div className="card">
        <h3>💾 備份與還原</h3>
        <p className="muted">進度與作品只在這台裝置。換手機或清瀏覽器前先匯出。</p>
        <div className="row">
          <button className="btn" onClick={exportLight}>匯出進度（不含照片）</button>
          <button className="btn" onClick={exportFull}>匯出完整備份（含照片，較大）</button>
          <label className="btn ghost">匯入備份<input type="file" accept="application/json" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void onImport(f) }} /></label>
        </div>
        <div className="divider" />
        <button className="btn ghost" style={{ color: 'var(--bad)' }} onClick={async () => { if (confirm('清除全部進度與作品？無法復原（金鑰不受影響）。')) { await clearAllPhotos(); resetAll(); setMsg('已清除') } }}>清除全部資料</button>
      </div>
      <div className="card">
        <h3>ℹ️ 關於</h3>
        <p className="muted">攝影道場 © 2026 wadasiwak。教學文字原創；鑑賞題圖片來自 Wikimedia Commons 精選/優質圖片，依各圖授權（CC0 / CC BY / CC BY-SA / 公有領域）署名。本機分析為客觀量測參考，不代表美感評價。</p>
        <p className="tiny">📱 iOS 用戶建議「加入主畫面」，避免 Safari 清除久未使用網站的資料。</p>
      </div>
    </div>
  )
}

function download(name: string, text: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}
