// 課程範例圖：從 Commons 圖池挑符合本課原則的好照片（附為什麼好＋署名）、
// 一組真實對比、以及用變體引擎即時做的「一秒看差別」（原圖 vs 違反本課原則的版本）。
import { useEffect, useState } from 'react'
import { POOL, PAIRS, type CommonsImage, type Lesson } from '../content/index.ts'
import { PRINCIPLES, type PrincipleId } from '../content/principles.ts'
import { hashString, mulberry32 } from '../lib/seed.ts'
import { loadImage } from '../lib/quizEngine.ts'
import { analyze } from '../lib/analyze/index.ts'
import { rasterFromImage } from '../lib/raster/fromImage.ts'
import { rasterToDataUrl } from '../lib/raster/toBlob.ts'
import { crop, resampleBilinear } from '../lib/raster/index.ts'
import { FLAWS, eligibleFlaws, makeVariant, type FlawId } from '../lib/variants/index.ts'
import { Credit } from './Credit.tsx'

/** 原則 → 示範用壞法（只有引擎能做的那幾條） */
const DEMO_FLAW: Partial<Record<PrincipleId, FlawId>> = {
  'horizon-level': 'tilt',
  exposure: 'overexpose',
  'dynamic-range': 'underexpose',
  'subject-placement': 'cropSubject',
  'rule-of-thirds': 'centerCrop',
  saturation: 'desaturate',
  'white-balance': 'colorCast',
  sharpness: 'blur',
  noise: 'noise',
}

function pickExamples(lesson: Lesson, n: number): CommonsImage[] {
  const r = mulberry32(hashString(`examples:${lesson.id}`))
  const shuffle = <T,>(a: T[]) => a.map((x) => [r(), x] as const).sort((p, q) => p[0] - q[0]).map((p) => p[1])
  const [main, ...rest] = lesson.relatedPrinciples
  const primary = shuffle(POOL.filter((i) => i.principles.includes(main)))
  const secondary = shuffle(POOL.filter((i) => !i.principles.includes(main) && i.principles.some((p) => rest.includes(p))))
  return [...primary, ...secondary].slice(0, n)
}

export function LessonExamples({ lesson }: { lesson: Lesson }) {
  const examples = pickExamples(lesson, 4)
  const main = lesson.relatedPrinciples[0]
  const r = mulberry32(hashString(`pair:${lesson.id}`))
  const pairPool = PAIRS.filter((p) => p.principles.includes(main))
  const pairs = pairPool.length ? pairPool : PAIRS.filter((p) => p.principles.some((q) => lesson.relatedPrinciples.includes(q)))
  const pair = pairs.length ? pairs[Math.floor(r() * pairs.length)] : null
  const demoFlaw = DEMO_FLAW[main]
  return (
    <>
      {demoFlaw && <LiveDemo lesson={lesson} flawId={demoFlaw} />}
      {examples.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <h3 style={{ color: 'var(--accent)' }}>🖼 範例作品</h3>
          <p className="tiny">Wikimedia Commons 精選圖片，看看別人怎麼把這課的原則用出來。</p>
          <div className="examples">
            {examples.map((img) => (
              <figure key={img.id} className="example">
                <a href={img.sourceUrl} target="_blank" rel="noopener noreferrer"><img src={img.src} alt={img.title} loading="lazy" /></a>
                <figcaption>
                  <div>{img.principles.map((p) => <span key={p} className={`tag ${p === main ? 'accent' : ''}`}>{PRINCIPLES[p].emoji} {PRINCIPLES[p].name}</span>)}</div>
                  <p style={{ margin: '4px 0' }}>{img.whyGood}</p>
                  <Credit img={img} />
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}
      {pair && (
        <div className="card" style={{ marginTop: 12 }}>
          <h3 style={{ color: 'var(--accent)' }}>⚖️ 對比範例：{pair.theme}</h3>
          <div className="quiz-pair">
            {([['good', '較到位'], ['weak', '較可惜']] as const).map(([side, label]) => (
              <figure key={side} className="example" style={{ margin: 0 }}>
                <div className={`quiz-choice ${side === 'good' ? 'correct' : ''}`} style={{ cursor: 'default' }}>
                  <img src={pair[side].src} alt={label} loading="lazy" />
                  <span className="badge">{label}</span>
                </div>
                <figcaption><Credit img={pair[side]} /></figcaption>
              </figure>
            ))}
          </div>
          <p style={{ marginTop: 10 }}>{pair.explanation}</p>
        </div>
      )}
    </>
  )
}

/** 一秒看差別：拿一張合格的池圖，即時做出違反本課原則的版本並排 */
function LiveDemo({ lesson, flawId }: { lesson: Lesson; flawId: FlawId }) {
  const [demo, setDemo] = useState<{ good: string; bad: string; explain: string; img: CommonsImage } | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const r = mulberry32(hashString(`demo:${lesson.id}`))
      const cands = POOL.filter((i) => eligibleFlaws(i.tags).includes(flawId))
      const order = cands.map((c) => [r(), c] as const).sort((a, b) => a[0] - b[0]).map((x) => x[1])
      for (const img of order.slice(0, 4)) {
        try {
          const el = await loadImage(img.src)
          if (cancelled) return
          const raster = rasterFromImage(el, 800)
          const report = analyze(rasterFromImage(el, 480))
          if (!eligibleFlaws(img.tags, report).includes(flawId)) continue
          const v = makeVariant(raster, flawId, `demo:${lesson.id}`, 'easy', report)
          let good = raster
          if (v.cropApplied) { const c = v.cropApplied; good = resampleBilinear(crop(raster, c.x, c.y, c.w, c.h), raster.w, raster.h) }
          if (cancelled) return
          setDemo({ good: rasterToDataUrl(good, 0.88), bad: rasterToDataUrl(v.raster, 0.88), explain: v.explain, img })
          return
        } catch { /* 換下一張 */ }
      }
      if (!cancelled) setFailed(true)
    })()
    return () => { cancelled = true }
  }, [lesson.id, flawId])
  if (failed) return null
  return (
    <div className="card" style={{ marginTop: 12 }} data-testid="live-demo">
      <h3 style={{ color: 'var(--accent)' }}>👀 一秒看差別</h3>
      <p className="tiny">同一張照片，右邊是故意「{FLAWS[flawId].label}」的版本——這就是本課要避免的事。</p>
      {demo ? (
        <>
          <div className="quiz-pair">
            <div className="quiz-choice correct" style={{ cursor: 'default' }}><img src={demo.good} alt="原圖" /><span className="badge">原圖</span></div>
            <div className="quiz-choice wrong" style={{ cursor: 'default' }}><img src={demo.bad} alt={FLAWS[flawId].label} /><span className="badge">{FLAWS[flawId].label}</span></div>
          </div>
          <p style={{ marginTop: 10 }}>{demo.explain}</p>
          <Credit img={demo.img} />
        </>
      ) : (
        <div style={{ padding: 20, textAlign: 'center' }}><span className="spinner" /> 產生示範中…</div>
      )}
    </div>
  )
}
