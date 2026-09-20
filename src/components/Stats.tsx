import { useApp } from '../state.ts'
import { PRINCIPLE_IDS, PRINCIPLES } from '../content/principles.ts'
import { LESSONS, CHAPTERS, CHAPTER_IDS, LESSONS_BY_CHAPTER } from '../content/index.ts'
import { accuracy, levelOf } from '../lib/srs.ts'
import { lessonForPrinciple } from './photo/ReportView.tsx'

export function Stats() {
  const go = useApp((s) => s.go)
  const quiz = useApp((s) => s.quiz)
  const srs = useApp((s) => s.srs)
  const done = useApp((s) => s.lessonsDone)
  const gallery = useApp((s) => s.gallery)
  const lv = levelOf(quiz.correct)
  const rows = PRINCIPLE_IDS.map((p) => ({ p, s: srs[p], acc: accuracy(srs[p]) })).sort((a, b) => (a.acc ?? 2) - (b.acc ?? 2))
  return (
    <>
      <section className="hero"><h1 className="hero-title">進度</h1><p className="hero-sub">哪些原則已經看得出來、哪些還會被騙。</p></section>
      <div className="stat-row">
        <div className="stat"><b>Lv.{lv.level}</b><span>{lv.title}{Number.isFinite(lv.next) ? ` · 再答對 ${lv.next - quiz.correct} 題升級` : ''}</span></div>
        <div className="stat"><b>{quiz.total ? Math.round((quiz.correct / quiz.total) * 100) : 0}%</b><span>鑑賞正確率（{quiz.correct}/{quiz.total}）</span></div>
        <div className="stat"><b>{quiz.bestStreak}</b><span>最長連對</span></div>
        <div className="stat"><b>{Object.keys(done).length}/{LESSONS.length}</b><span>課程完成</span></div>
        <div className="stat"><b>{gallery.length}</b><span>作品</span></div>
      </div>
      <h2 className="section-title">各原則眼力</h2>
      <div className="card radar" data-testid="radar">
        {rows.map(({ p, s, acc }) => (
          <div key={p} className="r">
            <span style={{ width: 90 }}>{PRINCIPLES[p].emoji} {PRINCIPLES[p].name}</span>
            <div className="progress"><i style={{ width: `${acc === null ? 0 : acc * 100}%`, background: acc === null ? 'var(--line)' : acc < 0.6 ? 'var(--bad)' : acc < 0.85 ? 'var(--warn)' : 'var(--ok)' }} /></div>
            <span className="tiny" style={{ width: 56, textAlign: 'right' }}>{acc === null ? '未測' : `${Math.round(acc * 100)}% (${s!.correct + s!.wrong})`}</span>
          </div>
        ))}
      </div>
      {rows[0]?.acc !== null && rows[0]?.acc !== undefined && rows[0].acc < 0.7 && (() => { const l = lessonForPrinciple(rows[0].p); return l ? (
        <div className="notice" style={{ marginTop: 10 }}>最弱的是「{PRINCIPLES[rows[0].p].name}」，建議複習 <a href="#" onClick={(e) => { e.preventDefault(); go({ name: 'learn', chapter: l.chapter, lessonId: l.id }) }}>{l.title}</a>。</div>
      ) : null })()}
      <h2 className="section-title">課程進度</h2>
      <div className="grid">
        {CHAPTER_IDS.map((c) => { const ls = LESSONS_BY_CHAPTER[c]; const n = ls.filter((l) => done[l.id]).length; return (
          <button key={c} className="tile" onClick={() => go({ name: 'learn', chapter: c })}>
            <b>{CHAPTERS[c].emoji} {CHAPTERS[c].title}</b>
            <div className="progress"><i style={{ width: `${(n / ls.length) * 100}%` }} /></div>
            <span className="tiny">{n}/{ls.length}</span>
          </button>
        ) })}
      </div>
    </>
  )
}
