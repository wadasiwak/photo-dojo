import { useRef } from 'react'

export function UploadBox({ onFile, busy, label = '點這裡選照片，或直接拖進來' }: { onFile: (f: File) => void; busy: boolean; label?: string }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <label
      className="drop"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) onFile(f) }}
      data-testid="upload-box"
    >
      <input ref={ref} type="file" accept="image/*" data-testid="file-input" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
      <div style={{ fontSize: '2rem' }}>{busy ? <span className="spinner" /> : '📷'}</div>
      <div>{busy ? '分析中…' : label}</div>
      <div className="tiny">照片只在你的瀏覽器處理；按 AI 講評才會送出（且只送給你選的服務）。</div>
    </label>
  )
}
