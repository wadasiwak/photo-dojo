import { useApp, type View } from '../state.ts'
import { CHAPTERS, CHAPTER_IDS, LESSONS, LESSONS_BY_CHAPTER, LESSON_BY_ID, type ChapterId } from '../content/index.ts'
import { PRINCIPLES } from '../content/principles.ts'

export function Learn({ view }: { view: Extract<View, { name: 'learn' }> }) {
  if (view.lessonId) return <LessonView id={view.lessonId} />
  return <ChapterList chapter={view.chapter} />
}

function ChapterList({ chapter }: { chapter?: ChapterId }) {
  const go = useApp((s) => s.go)
  const done = useApp((s) => s.lessonsDone)
  const chapters = chapter ? [chapter] : CHAPTER_IDS
  const total = Object.keys(done).length
  return (
    <>
      <section className="hero">
        <h1 className="hero-title">拍照教學</h1>
        <p className="hero-sub">手機為主、相機觀念兼顧。每課附練習任務與自評檢核，看完就出門拍。已完成 {total}/{LESSONS.length}。</p>
      </section>
      {chapters.map((c) => (
        <section key={c}>
          <div className="chapter-head">
            <span className="ico">{CHAPTERS[c].emoji}</span>
            <h2 style={{ margin: 0 }}>{CHAPTERS[c].title}</h2>
            <span className="muted">{CHAPTERS[c].blurb}</span>
          </div>
          <div className="lesson-list">
            {LESSONS_BY_CHAPTER[c].map((l, i) => (
              <button key={l.id} className="lesson-item" onClick={() => go({ name: 'learn', chapter: c, lessonId: l.id })} data-testid="lesson-item">
                <span className={`num ${done[l.id] ? 'done' : ''}`}>{done[l.id] ? '✓' : i + 1}</span>
                <div>
                  <b>{l.title}</b>
                  <span>{l.summary}</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}
    </>
  )
}

function LessonView({ id }: { id: string }) {
  const go = useApp((s) => s.go)
  const lesson = LESSON_BY_ID.get(id)!
  const done = useApp((s) => !!s.lessonsDone[id])
  const markLesson = useApp((s) => s.markLesson)
  const checks = useApp((s) => s.checklist[id])
  const toggleCheck = useApp((s) => s.toggleCheck)
  const idx = LESSONS.findIndex((l) => l.id === id)
  const prev = LESSONS[idx - 1]
  const next = LESSONS[idx + 1]
  const n = lesson.exercise.checklist.length
  return (
    <article>
      <button className="back" onClick={() => go({ name: 'learn', chapter: lesson.chapter })}>← {CHAPTERS[lesson.chapter].title}</button>
      <h1 style={{ fontSize: '1.6rem', marginTop: 6 }}>{lesson.title}</h1>
      <p className="muted">{lesson.summary}</p>
      <div>
        {lesson.relatedPrinciples.map((p) => (
          <span key={p} className="tag accent">{PRINCIPLES[p].emoji} {PRINCIPLES[p].name}</span>
        ))}
      </div>
      <div className="lesson-body card" style={{ marginTop: 14 }}>
        {lesson.body.map((p, i) => <p key={i}>{p}</p>)}
        <h3>📱 手機這樣做</h3>
        <ul>{lesson.phoneTips.map((t, i) => <li key={i}>{t}</li>)}</ul>
        {lesson.cameraNotes.length > 0 && (
          <>
            <h3>📸 相機觀念</h3>
            <ul>{lesson.cameraNotes.map((t, i) => <li key={i}>{t}</li>)}</ul>
          </>
        )}
        <h3>⚠️ 常見錯誤</h3>
        <ul>{lesson.commonMistakes.map((t, i) => <li key={i}>{t}</li>)}</ul>
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <h3 style={{ color: 'var(--accent)' }}>🏋️ 練習任務</h3>
        <p>{lesson.exercise.task}</p>
        <div className="checklist">
          {lesson.exercise.checklist.map((c, i) => (
            <label key={i}>
              <input type="checkbox" checked={!!checks?.[i]} onChange={() => toggleCheck(id, i, n)} />
              <span>{c}</span>
            </label>
          ))}
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className={`btn ${done ? '' : 'primary'}`} onClick={() => markLesson(id, !done)} data-testid="lesson-done">
            {done ? '✓ 已完成（點擊取消）' : '標記完成'}
          </button>
          <button className="btn ghost" onClick={() => go({ name: 'score' })}>拍完去評分 →</button>
        </div>
      </div>
      <div className="lesson-nav">
        {prev ? <button className="btn ghost" onClick={() => go({ name: 'learn', chapter: prev.chapter, lessonId: prev.id })}>← {prev.title}</button> : <span />}
        {next ? <button className="btn ghost" onClick={() => go({ name: 'learn', chapter: next.chapter, lessonId: next.id })}>{next.title} →</button> : <span />}
      </div>
    </article>
  )
}
