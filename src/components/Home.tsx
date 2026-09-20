import { useApp } from '../state.ts'
import { LESSONS, CHALLENGES } from '../content/index.ts'
import { pickDailyChallenge } from '../lib/daily.ts'
import { todayStr } from '../lib/seed.ts'
import { levelOf } from '../lib/srs.ts'

export function Home() {
  const go = useApp((s) => s.go)
  const done = useApp((s) => Object.keys(s.lessonsDone).length)
  const quiz = useApp((s) => s.quiz)
  const gallery = useApp((s) => s.gallery)
  const today = todayStr()
  const ch = pickDailyChallenge(today)
  const submitted = gallery.some((g) => g.date === today && g.challengeId === ch.id)
  const lv = levelOf(quiz.correct)
  return (
    <>
      <section className="hero">
        <h1 className="hero-title">練出好照片的眼與手</h1>
        <p className="hero-sub">手機就夠。先學會看，再學會拍：{LESSONS.length} 課教學、照片評分、「哪張好看」鑑賞測驗、每日拍照任務。</p>
      </section>

      <button className="card daily-card tile" style={{ width: '100%' }} onClick={() => go({ name: 'daily' })} data-testid="home-daily">
        <span className="tiny">今日拍照任務 · {today}</span>
        <b>📅 {ch.title}</b>
        <span>{ch.brief}</span>
        <span className={`pill ${submitted ? 'ok' : ''}`}>{submitted ? '✓ 今天已交作業' : `難度 ${'★'.repeat(ch.difficulty)} · ${ch.indoorOk ? '室內可' : '要出門'}`}</span>
      </button>

      <h2 className="section-title">四個練功房</h2>
      <div className="home-tiles">
        <button className="tile" onClick={() => go({ name: 'learn' })}>
          <span className="ico">📖</span><b>拍照教學</b>
          <span>{LESSONS.length} 課，構圖・光線・曝光・色彩・場景實戰</span>
          <div className="progress"><i style={{ width: `${(done / LESSONS.length) * 100}%` }} /></div>
          <span className="tiny">已完成 {done}/{LESSONS.length}</span>
        </button>
        <button className="tile" onClick={() => go({ name: 'score' })}>
          <span className="ico">📷</span><b>照片評分</b>
          <span>上傳照片，本機分析曝光/構圖/水平/色彩，再選 AI 講評</span>
        </button>
        <button className="tile" onClick={() => go({ name: 'quiz' })}>
          <span className="ico">👀</span><b>哪張好看？</b>
          <span>二選一鑑賞測驗，答錯的原則會更常出現</span>
          <span className="tiny">Lv.{lv.level} {lv.title} · 答對 {quiz.correct}/{quiz.total}{quiz.streak > 1 ? ` · 🔥 連對 ${quiz.streak}` : ''}</span>
        </button>
        <button className="tile" onClick={() => go({ name: 'gallery' })}>
          <span className="ico">🖼</span><b>作品集</b>
          <span>{gallery.length ? `${gallery.length} 張作品與分數軌跡` : '交過的作業與評過的照片都會在這'}</span>
        </button>
      </div>

      <h2 className="section-title">怎麼用最有效</h2>
      <div className="card">
        <ol className="steps">
          <li>每天先做「哪張好看」10 題，練眼力（3 分鐘）。</li>
          <li>看一課教學，帶著它的練習任務出門拍。</li>
          <li>回來把照片丟進「評分」，看客觀指標有沒有抓到你想要的效果。</li>
          <li>交每日任務進作品集，一個月後回頭看分數曲線。</li>
        </ol>
        <p className="tiny">題庫 {CHALLENGES.length} 個任務、日期決定當天題目，全世界同一天同一題。</p>
      </div>
    </>
  )
}
