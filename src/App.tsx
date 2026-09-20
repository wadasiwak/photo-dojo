import { useApp, type View } from './state.ts'
import { Home } from './components/Home.tsx'
import { Learn } from './components/Learn.tsx'
import { Score } from './components/Score.tsx'
import { Quiz } from './components/Quiz.tsx'
import { Daily } from './components/Daily.tsx'
import { Gallery } from './components/Gallery.tsx'
import { Stats } from './components/Stats.tsx'
import { Settings } from './components/Settings.tsx'

const NAV: Array<{ name: View['name']; label: string; ico: string }> = [
  { name: 'learn', label: '教學', ico: '📖' },
  { name: 'score', label: '評分', ico: '📷' },
  { name: 'quiz', label: '鑑賞', ico: '👀' },
  { name: 'daily', label: '每日', ico: '📅' },
  { name: 'gallery', label: '作品', ico: '🖼' },
]

export default function App() {
  const view = useApp((s) => s.view)
  const go = useApp((s) => s.go)
  const active = (n: View['name']) => view.name === n
  return (
    <>
      <header className="topbar">
        <button className="brand" onClick={() => go({ name: 'home' })} aria-label="回首頁">
          <img src="./favicon.svg" alt="" /> 攝影道場
        </button>
        <nav className="nav">
          {NAV.map((n) => (
            <button key={n.name} className={active(n.name) ? 'active' : ''} onClick={() => go({ name: n.name } as View)}>
              {n.label}
            </button>
          ))}
          <button className={active('stats') ? 'active' : ''} onClick={() => go({ name: 'stats' })}>進度</button>
          <button className={active('settings') ? 'active' : ''} onClick={() => go({ name: 'settings' })}>⚙️</button>
        </nav>
      </header>
      <main>
        {view.name === 'home' && <Home />}
        {view.name === 'learn' && <Learn view={view} />}
        {view.name === 'score' && <Score />}
        {view.name === 'quiz' && <Quiz view={view} />}
        {view.name === 'daily' && <Daily view={view} />}
        {view.name === 'gallery' && <Gallery view={view} />}
        {view.name === 'stats' && <Stats />}
        {view.name === 'settings' && <Settings />}
      </main>
      <footer className="footer">
        <div>© 2026 wadasiwak. All rights reserved. 教學文字為原創；鑑賞題圖片來自 Wikimedia Commons，依各圖授權署名。</div>
        <div>照片、進度只存在你的裝置；AI 講評需自備金鑰或使用免費外包鍵。本站評分為練習參考，不是美感判決。</div>
      </footer>
      <nav className="tabbar">
        {NAV.map((n) => (
          <button key={n.name} className={active(n.name) ? 'active' : ''} onClick={() => go({ name: n.name } as View)}>
            <span className="ico">{n.ico}</span>
            {n.label}
          </button>
        ))}
        <button className={active('stats') || active('settings') ? 'active' : ''} onClick={() => go({ name: 'stats' })}>
          <span className="ico">📈</span>進度
        </button>
      </nav>
    </>
  )
}
