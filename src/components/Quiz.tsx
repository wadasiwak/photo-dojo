import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp, type View } from '../state.ts'
import { PRINCIPLES } from '../content/principles.ts'
import { PAIRS } from '../content/index.ts'
import { buildPairItem, buildVariantItem, type QuizItem } from '../lib/quizEngine.ts'
import { levelOf } from '../lib/srs.ts'
import { lessonForPrinciple } from './photo/ReportView.tsx'
import { Credit } from './Credit.tsx'

type Mode = 'mix' | 'variant' | 'pair'

export function Quiz({ view }: { view: Extract<View, { name: 'quiz' }> }) {
  const go = useApp((s) => s.go)
  const srs = useApp((s) => s.srs)
  const quiz = useApp((s) => s.quiz)
  const answerQuiz = useApp((s) => s.answerQuiz)
  const difficulty = useApp((s) => s.quizDifficulty)
  const setDifficulty = useApp((s) => s.setQuizDifficulty)
  const [mode, setMode] = useState<Mode>(view.mode ?? 'mix')
  const [item, setItem] = useState<QuizItem | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<'left' | 'right' | null>(null)
  const recent = useRef<Set<string>>(new Set())
  const counter = useRef(0)

  const next = useCallback(async () => {
    setLoading(true)
    setError(null)
    setPicked(null)
    setItem(null)
    counter.current++
    const seedStr = `${Date.now()}-${counter.current}-${Math.random().toString(36).slice(2, 8)}`
    const wantPair = mode === 'pair' || (mode === 'mix' && PAIRS.length > 0 && counter.current % 4 === 0)
    try {
      let it: QuizItem | null = null
      if (wantPair) it = buildPairItem(seedStr, recent.current)
      if (!it) it = await buildVariantItem(srs, difficulty, seedStr, recent.current)
      if (!it && !wantPair) it = buildPairItem(seedStr, recent.current)
      if (!it) { setError('目前載不到題目（可能是網路問題），請稍後再試。'); return }
      recent.current.add(it.kind === 'variant' ? it.image.id : it.id)
      if (recent.current.size > 12) recent.current.delete(recent.current.values().next().value!)
      setItem(it)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [mode, srs, difficulty])

  useEffect(() => { void next() }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  // e2e hook：讀當前題目答案
  useEffect(() => {
    ;(window as unknown as { __dojo?: Record<string, unknown> }).__dojo = { item, picked, srs, quiz }
  }, [item, picked, srs, quiz])

  const answer = (side: 'left' | 'right') => {
    if (!item || picked) return
    setPicked(side)
    const correct = (side === 'left') === item.goodOnLeft
    const principles = item.kind === 'variant' ? [item.principle] : item.pair.principles
    answerQuiz(principles, correct)
  }

  const lv = levelOf(quiz.correct)
  const correct = picked ? (picked === 'left') === item!.goodOnLeft : null

  return (
    <>
      <section className="hero">
        <h1 className="hero-title">哪張好看？</h1>
        <p className="hero-sub">兩張選一張。答錯的原則會更常出現，直到你看得出來。</p>
      </section>
      <div className="quiz-status">
        <span className="pill">Lv.{lv.level} {lv.title}</span>
        <span className="pill">答對 {quiz.correct}/{quiz.total}</span>
        {quiz.streak > 1 && <span className="pill streak">🔥 連對 {quiz.streak}</span>}
        <span style={{ flex: 1 }} />
        <div className="seg" title="題型">
          {(['mix', 'variant', 'pair'] as Mode[]).map((m) => (
            <button key={m} className={mode === m ? 'active' : ''} onClick={() => { setMode(m); go({ name: 'quiz', mode: m === 'mix' ? undefined : m }) }}>
              {m === 'mix' ? '混合' : m === 'variant' ? '同圖找茬' : '真實對比'}
            </button>
          ))}
        </div>
        <div className="seg" title="難度">
          {(['easy', 'medium', 'hard'] as const).map((d) => (
            <button key={d} className={difficulty === d ? 'active' : ''} onClick={() => setDifficulty(d)}>{d === 'easy' ? '易' : d === 'medium' ? '中' : '難'}</button>
          ))}
        </div>
      </div>

      {loading && <div className="card" style={{ textAlign: 'center', padding: 40 }}><span className="spinner" /> 出題中…（第一次要下載圖片）</div>}
      {error && <div className="card"><p className="error">{error}</p><button className="btn" onClick={next}>再試一次</button></div>}

      {item && !loading && (
        <>
          <p className="muted" style={{ margin: '0 0 8px' }}>
            {item.kind === 'variant' ? '同一張照片、其中一張被動了手腳。哪張比較好？' : `主題「${item.pair.theme}」：兩位攝影者的作品，哪張比較到位？`}
          </p>
          <div className="quiz-pair" data-testid="quiz-pair">
            {(['left', 'right'] as const).map((side) => {
              const isGood = (side === 'left') === item.goodOnLeft
              const url = item.kind === 'variant' ? (isGood ? item.goodUrl : item.badUrl) : (isGood ? item.pair.good.src : item.pair.weak.src)
              const cls = picked ? (isGood ? 'correct' : picked === side ? 'wrong' : '') : ''
              return (
                <button key={side} className={`quiz-choice ${cls}`} onClick={() => answer(side)} data-testid={`choice-${side}`} data-good={isGood ? '1' : '0'} disabled={!!picked}>
                  <img src={url} alt={side === 'left' ? '左圖' : '右圖'} />
                  <span className="badge">{side === 'left' ? 'A' : 'B'}</span>
                  {picked && <span className="mark">{isGood ? '✅' : picked === side ? '❌' : ''}</span>}
                </button>
              )
            })}
          </div>

          {picked && (
            <div className="card explain" data-testid="explain">
              <div className={`verdict ${correct ? 'ok' : 'bad'}`}>{correct ? '答對了！' : '這題差在這裡：'}</div>
              {item.kind === 'variant' ? (
                <>
                  <p><span className="tag accent">{PRINCIPLES[item.principle].emoji} {PRINCIPLES[item.principle].name}</span><span className="tag">{item.flawLabel}</span><span className="tag">{item.difficulty === 'hard' ? '難' : item.difficulty === 'medium' ? '中' : '易'}</span></p>
                  <p>{item.explain}</p>
                  <p className="muted"><b>原圖為什麼好：</b>{item.image.whyGood}</p>
                  <Credit img={item.image} />
                </>
              ) : (
                <>
                  <p>{item.pair.principles.map((p) => <span key={p} className="tag accent">{PRINCIPLES[p].emoji} {PRINCIPLES[p].name}</span>)}</p>
                  <p>{item.pair.explanation}</p>
                  <div className="tiny">較好：<Credit img={item.pair.good} inline /></div>
                  <div className="tiny">較弱：<Credit img={item.pair.weak} inline /></div>
                </>
              )}
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn primary" onClick={next} data-testid="next-btn">下一題 →</button>
                {(() => {
                  const p = item.kind === 'variant' ? item.principle : item.pair.principles[0]
                  const l = lessonForPrinciple(p)
                  return l ? <button className="btn ghost" onClick={() => go({ name: 'learn', chapter: l.chapter, lessonId: l.id })}>看「{l.title}」</button> : null
                })()}
              </div>
            </div>
          )}
          {!picked && <p className="tiny" style={{ marginTop: 8 }}>鍵盤：<kbd>1</kbd> 選 A、<kbd>2</kbd> 選 B</p>}
          <KeyHandler onKey={(k) => { if (!picked) { if (k === '1') answer('left'); if (k === '2') answer('right') } else if (k === 'Enter' || k === ' ') void next() }} />
        </>
      )}
    </>
  )
}

function KeyHandler({ onKey }: { onKey: (k: string) => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.target as HTMLElement)?.tagName === 'TEXTAREA' || (e.target as HTMLElement)?.tagName === 'INPUT') return; onKey(e.key) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onKey])
  return null
}
