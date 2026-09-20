// 內容驗證（CI gate；內容 agent 交付前自驗）
//
// 驗什麼：
// - principles：每個 PrincipleId 至少被 1 課 relatedPrinciples 引用（全量模式）
// - lessons：id 格式 `<chapter>-slug` 且 chapter 一致、全站唯一、每章課數 = CHAPTERS.lessonCount、
//   summary/body/phoneTips/cameraNotes/commonMistakes/exercise 字數範圍、principles 合法、禁詞、簡體字
// - challenges：id `ch-` 唯一、每 principle ≥2 題、difficulty/indoorOk 分布、字數
// - pool：id `img-<category>-NNN`、授權白名單（先擋 NC/ND）、src host upload.wikimedia.org、
//   tags ⊂ SOURCE_TAGS、principles 合法、whyGood 字數、每 tag 覆蓋（horizon/architecture ≥8）
// - pairs：id `pair-NNN`、兩張授權/host、principles、explanation 字數、圖 id 不重複
//
// 單檔模式（內容 agent 自驗）：node scripts/check-content.mjs src/content/lessons/light.ts
// 全量模式（CI）：node scripts/check-content.mjs
// 需 node ≥ 23（type stripping 直 import .ts）。內容檔還沒到齊時自動跳過（optional），全量模式缺檔只 WARN。
import { existsSync } from 'node:fs'
import { basename, join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const loadModule = (rel) => import(join(root, rel))

const { PRINCIPLE_IDS } = await loadModule('src/content/principles.ts')
const { CHAPTERS, CHAPTER_IDS, SOURCE_TAGS, POOL_CATEGORIES } = await loadModule('src/content/types.ts')
const PID = new Set(PRINCIPLE_IDS)
const TAGS = new Set(SOURCE_TAGS)

let errors = 0
let warns = 0
const err = (msg) => { console.error(`  ERROR: ${msg}`); errors++ }
const warn = (msg) => { console.warn(`  WARN:  ${msg}`); warns++ }

const FORBIDDEN = ['總之', '綜上所述', '多練習就會進步', '多拍就對了', '相信自己', '沒有標準答案']
const SIMPLIFIED_RE = /[个们关书发买卖东车马问题让说对时没这为过还进远运动应现实爱见观觉视质变体万与专业丰临义乐习乡产从众优伤价传债倾儿险则剧劝办务势区医历厉压厌县双叙号叶吓吗听启松气图摄]/u

function checkText(tag, field, text, [min, max], hard = [Math.floor(min * 0.7), Math.ceil(max * 1.3)]) {
  if (typeof text !== 'string' || text.length === 0) return err(`${tag} ${field} 缺漏或非字串`)
  const n = [...text].length
  if (n < hard[0] || n > hard[1]) err(`${tag} ${field} 長度 ${n} 超出硬界（規範 ${min}–${max}）`)
  else if (n < min || n > max) warn(`${tag} ${field} 長度 ${n} 略出規範 ${min}–${max}`)
  for (const w of FORBIDDEN) if (text.includes(w)) err(`${tag} ${field} 含禁詞「${w}」`)
  const m = text.match(SIMPLIFIED_RE)
  if (m) err(`${tag} ${field} 疑似含簡體字：${m[0]}`)
}
function checkList(tag, field, arr, [cmin, cmax], range) {
  if (!Array.isArray(arr)) return err(`${tag} ${field} 非陣列`)
  if (arr.length < cmin || arr.length > cmax) err(`${tag} ${field} 條數 ${arr.length} 應在 ${cmin}–${cmax}`)
  arr.forEach((t, i) => checkText(tag, `${field}[${i}]`, t, range))
}
function checkPrinciples(tag, field, arr, [cmin, cmax]) {
  if (!Array.isArray(arr) || arr.length < cmin || arr.length > cmax) return err(`${tag} ${field} 應為 ${cmin}–${cmax} 個 PrincipleId`)
  for (const p of arr) if (!PID.has(p)) err(`${tag} ${field} 未知 principle「${p}」`)
}

const isLicenseOk = (s) => {
  if (typeof s !== 'string' || !s) return false
  const t = s.trim().toLowerCase()
  if (t.includes('nc') || t.includes('nd')) return false
  return t === 'cc0' || t === 'attribution' || t.includes('public domain') || t === 'pd' || t.startsWith('cc by') || t.startsWith('cc-by')
}
function checkCommonsImage(tag, img) {
  if (typeof img.src !== 'string' || !/^https:\/\/upload\.wikimedia\.org\//.test(img.src)) err(`${tag} src 不是 upload.wikimedia.org：${img.src}`)
  if (!isLicenseOk(img.license)) err(`${tag} 授權不在白名單：${img.license}`)
  if (typeof img.author !== 'string' || !img.author) err(`${tag} author 空`)
  if (typeof img.licenseUrl !== 'string' || !img.licenseUrl.startsWith('http')) err(`${tag} licenseUrl 缺`)
  if (typeof img.sourceUrl !== 'string' || !/commons\.wikimedia\.org/.test(img.sourceUrl)) err(`${tag} sourceUrl 應為 Commons File: 頁`)
  if (!(img.width > 0 && img.height > 0)) err(`${tag} width/height 缺`)
  if (typeof img.title !== 'string' || !img.title) err(`${tag} title 空`)
}

// ── 檔案表 ───────────────────────────────────────────────
const LESSON_FILES = Object.fromEntries(CHAPTER_IDS.map((c) => [`${c}.ts`, c]))
const LESSON_VAR = { composition: 'compositionLessons', light: 'lightLessons', exposure: 'exposureLessons', color: 'colorLessons', scenes: 'sceneLessons' }
const POOL_FILES = { 'landscape-architecture.ts': 'landscapeArchitecturePool', 'people-stilllife.ts': 'peopleStillLifePool' }

const arg = process.argv[2]
const single = arg ? basename(arg) : null
const known = single ? LESSON_FILES[single] || POOL_FILES[single] || single === 'challenges.ts' || single === 'pairs.ts' : true
if (!known) { console.error(`未知內容檔：${single}`); process.exit(1) }

const allLessonIds = new Set()
const usedPrinciples = new Set()
let lessonTotal = 0

async function checkLessonFile(file) {
  const chapter = LESSON_FILES[file]
  const rel = `src/content/lessons/${file}`
  if (!existsSync(join(root, rel))) { if (!single) warn(`${rel} 尚未產出（跳過）`); return }
  console.log(`== lessons/${file} ==`)
  const mod = await loadModule(rel)
  const arr = mod[LESSON_VAR[chapter]]
  if (!Array.isArray(arr)) return err(`${file} 沒有 export ${LESSON_VAR[chapter]}`)
  if (arr.length !== CHAPTERS[chapter].lessonCount) err(`${file} 課數 ${arr.length} ≠ 規劃 ${CHAPTERS[chapter].lessonCount}`)
  for (const l of arr) {
    const tag = `lesson ${l.id}`
    if (typeof l.id !== 'string' || !new RegExp(`^${chapter}-[a-z0-9-]+$`).test(l.id)) err(`${tag} id 格式錯（應 ${chapter}-slug）`)
    if (allLessonIds.has(l.id)) err(`${tag} id 重複`)
    allLessonIds.add(l.id)
    if (l.chapter !== chapter) err(`${tag} chapter=${l.chapter} 應為 ${chapter}`)
    checkText(tag, 'title', l.title, [4, 14])
    checkText(tag, 'summary', l.summary, [40, 80])
    if (!Array.isArray(l.body)) err(`${tag} body 非陣列`)
    else {
      if (l.body.length < 4 || l.body.length > 8) err(`${tag} body 段數 ${l.body.length} 應 4–8`)
      l.body.forEach((p, i) => checkText(tag, `body[${i}]`, p, [80, 220]))
      const total = l.body.reduce((s, p) => s + [...String(p)].length, 0)
      if (total < 600 * 0.85 || total > 1200 * 1.15) err(`${tag} body 總字數 ${total} 超出硬界（600–1200）`)
      else if (total < 600 || total > 1200) warn(`${tag} body 總字數 ${total} 略出 600–1200`)
    }
    checkList(tag, 'phoneTips', l.phoneTips, [3, 5], [20, 60])
    checkList(tag, 'cameraNotes', l.cameraNotes, [0, 3], [20, 70])
    checkList(tag, 'commonMistakes', l.commonMistakes, [2, 4], [15, 50])
    if (!l.exercise) err(`${tag} exercise 缺`)
    else {
      checkText(tag, 'exercise.task', l.exercise.task, [30, 90])
      checkList(tag, 'exercise.checklist', l.exercise.checklist, [3, 5], [10, 35])
    }
    checkPrinciples(tag, 'relatedPrinciples', l.relatedPrinciples, [1, 3])
    for (const p of l.relatedPrinciples ?? []) usedPrinciples.add(p)
    lessonTotal++
  }
  console.log(`  ${arr.length} 課`)
}

async function checkChallenges() {
  const rel = 'src/content/challenges.ts'
  if (!existsSync(join(root, rel))) { if (!single) warn(`${rel} 尚未產出（跳過）`); return }
  console.log('== challenges.ts ==')
  const { CHALLENGES } = await loadModule(rel)
  if (!Array.isArray(CHALLENGES)) return err('challenges.ts 沒有 export CHALLENGES')
  if (CHALLENGES.length < 50) err(`挑戰數 ${CHALLENGES.length} < 50`)
  const ids = new Set()
  const cover = Object.fromEntries(PRINCIPLE_IDS.map((p) => [p, 0]))
  const diff = { 1: 0, 2: 0, 3: 0 }
  let indoor = 0
  for (const c of CHALLENGES) {
    const tag = `challenge ${c.id}`
    if (typeof c.id !== 'string' || !/^ch-[a-z0-9-]+$/.test(c.id)) err(`${tag} id 格式錯`)
    if (ids.has(c.id)) err(`${tag} id 重複`)
    ids.add(c.id)
    checkText(tag, 'title', c.title, [3, 10])
    checkText(tag, 'brief', c.brief, [40, 110])
    checkList(tag, 'tips', c.tips, [2, 3], [15, 50])
    checkPrinciples(tag, 'principles', c.principles, [1, 2])
    for (const p of c.principles ?? []) if (p in cover) cover[p]++
    if (![1, 2, 3].includes(c.difficulty)) err(`${tag} difficulty 應 1|2|3`)
    else diff[c.difficulty]++
    if (typeof c.indoorOk !== 'boolean') err(`${tag} indoorOk 應為 boolean`)
    else if (c.indoorOk) indoor++
  }
  for (const [p, n] of Object.entries(cover)) if (n < 2) err(`principle「${p}」只有 ${n} 題（需 ≥2）`)
  if (indoor < 20) warn(`indoorOk 只有 ${indoor} 題`)
  console.log(`  ${CHALLENGES.length} 題；難度 ${JSON.stringify(diff)}；室內可 ${indoor}`)
}

const allImageIds = new Set()
const tagCount = Object.fromEntries(SOURCE_TAGS.map((t) => [t, 0]))
let poolTotal = 0
async function checkPoolFile(file) {
  const rel = `src/content/pool/${file}`
  if (!existsSync(join(root, rel))) { if (!single) warn(`${rel} 尚未產出（跳過）`); return }
  console.log(`== pool/${file} ==`)
  const mod = await loadModule(rel)
  const arr = mod[POOL_FILES[file]]
  if (!Array.isArray(arr)) return err(`${file} 沒有 export ${POOL_FILES[file]}`)
  const perCat = {}
  for (const img of arr) {
    const tag = `pool ${img.id}`
    if (typeof img.id !== 'string' || !/^img-(landscape|architecture|people-animals|still-life)-\d{3}$/.test(img.id)) err(`${tag} id 格式錯`)
    if (allImageIds.has(img.id)) err(`${tag} id 重複`)
    allImageIds.add(img.id)
    if (!POOL_CATEGORIES.includes(img.category)) err(`${tag} category 未知：${img.category}`)
    if (img.id && !img.id.startsWith(`img-${img.category}-`)) err(`${tag} id 前綴與 category 不符`)
    perCat[img.category] = (perCat[img.category] ?? 0) + 1
    checkCommonsImage(tag, img)
    if (!Array.isArray(img.tags) || img.tags.length < 1 || img.tags.length > 4) err(`${tag} tags 應 1–4 個`)
    else for (const t of img.tags) { if (!TAGS.has(t)) err(`${tag} 未知 tag「${t}」`); else tagCount[t]++ }
    checkText(tag, 'whyGood', img.whyGood, [50, 120])
    checkPrinciples(tag, 'principles', img.principles, [1, 3])
    poolTotal++
  }
  for (const [c, n] of Object.entries(perCat)) if (n < 15) warn(`${file} category ${c} 只有 ${n} 張（目標 ≥18）`)
  console.log(`  ${arr.length} 張：${JSON.stringify(perCat)}`)
}

async function checkPairs() {
  const rel = 'src/content/pairs.ts'
  if (!existsSync(join(root, rel))) { if (!single) warn(`${rel} 尚未產出（跳過）`); return }
  console.log('== pairs.ts ==')
  const { PAIRS } = await loadModule(rel)
  if (!Array.isArray(PAIRS)) return err('pairs.ts 沒有 export PAIRS')
  if (PAIRS.length < 15) warn(`對比題 ${PAIRS.length} < 15`)
  const ids = new Set()
  const imgIds = new Set()
  const dist = {}
  for (const p of PAIRS) {
    const tag = `pair ${p.id}`
    if (typeof p.id !== 'string' || !/^pair-\d{3}$/.test(p.id)) err(`${tag} id 格式錯`)
    if (ids.has(p.id)) err(`${tag} id 重複`)
    ids.add(p.id)
    checkText(tag, 'theme', p.theme, [3, 12])
    for (const side of ['good', 'weak']) {
      if (!p[side]) { err(`${tag} 缺 ${side}`); continue }
      checkCommonsImage(`${tag}.${side}`, p[side])
      if (imgIds.has(p[side].id)) err(`${tag}.${side} 圖 id ${p[side].id} 重複使用`)
      imgIds.add(p[side].id)
    }
    if (p.good && p.weak && p.good.src === p.weak.src) err(`${tag} good/weak 同一張圖`)
    checkPrinciples(tag, 'principles', p.principles, [1, 3])
    for (const q of p.principles ?? []) dist[q] = (dist[q] ?? 0) + 1
    checkText(tag, 'explanation', p.explanation, [80, 200])
  }
  for (const [q, n] of Object.entries(dist)) if (n > 8) warn(`principle「${q}」出現在 ${n} 組對比題（>8 偏集中）`)
  console.log(`  ${PAIRS.length} 組；原則分布 ${JSON.stringify(dist)}`)
}

// ── 執行 ─────────────────────────────────────────────────
if (single) {
  if (LESSON_FILES[single]) await checkLessonFile(single)
  else if (POOL_FILES[single]) await checkPoolFile(single)
  else if (single === 'challenges.ts') await checkChallenges()
  else if (single === 'pairs.ts') await checkPairs()
} else {
  for (const f of Object.keys(LESSON_FILES)) await checkLessonFile(f)
  await checkChallenges()
  for (const f of Object.keys(POOL_FILES)) await checkPoolFile(f)
  await checkPairs()
  if (lessonTotal > 0) {
    console.log('== principles 覆蓋 ==')
    const allChapters = Object.keys(LESSON_FILES).every((f) => existsSync(join(root, `src/content/lessons/${f}`)))
    for (const p of PRINCIPLE_IDS) if (!usedPrinciples.has(p)) (allChapters ? err : warn)(`principle「${p}」沒有任何課引用`)
  }
  if (poolTotal > 0) {
    console.log('== pool tags ==')
    console.log('  ' + JSON.stringify(tagCount))
    const allPool = Object.keys(POOL_FILES).every((f) => existsSync(join(root, `src/content/pool/${f}`)))
    if (allPool) {
      if (tagCount.horizon < 8) err(`tag horizon 只有 ${tagCount.horizon} 張（tilt 題需 ≥8）`)
      if (tagCount.architecture < 8) warn(`tag architecture 只有 ${tagCount.architecture} 張`)
    }
  }
  console.log(`\n內容統計：課程 ${lessonTotal}、圖池 ${poolTotal}`)
}

console.log(`\n${errors} error(s), ${warns} warn(s)`)
if (errors > 0) process.exit(1)
