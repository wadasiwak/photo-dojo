// 端到端測試：首頁 → 教學完成標記 → 評分（合成測試圖：本機分析出分、疊圖切換、AI mock、外包鍵、存作品集）
// → 鑑賞測驗（答題後解析出現、換題左右變化、SRS 錯題權重上升）→ 每日任務決定性 → 進度頁 → GoatCounter 隱私。
// 需先 npm run build；本腳本自行啟動 vite preview（port 5361，避開 dev 5360）。
// 鑑賞題會真的抓 Wikimedia Commons 圖（需網路，給 90 秒 timeout）。
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const PORT = 5361
const BASE_URL = `http://localhost:${PORT}/`
const SHOTS = '/tmp/photo-e2e'
mkdirSync(SHOTS, { recursive: true })

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: new URL('..', import.meta.url).pathname,
  stdio: 'ignore',
})

let browser
const fails = []
const fail = (msg) => { console.error(`FAIL: ${msg}`); fails.push(msg); process.exitCode = 1 }
const ok = (msg) => console.log(`  ok: ${msg}`)

try {
  for (let i = 0; i < 30; i++) {
    try { await fetch(BASE_URL); break } catch { await new Promise((r) => setTimeout(r, 300)); if (i === 29) throw new Error('preview server 沒起來') }
  }
  browser = await chromium.launch()
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'], viewport: { width: 1100, height: 900 } })
  const page = await context.newPage()
  page.on('dialog', (d) => d.accept())
  page.on('pageerror', (e) => fail(`pageerror: ${e.message}`))

  // 1. 首頁
  console.log('== 首頁 ==')
  await page.goto(BASE_URL)
  await page.waitForSelector('.hero-title', { timeout: 10000 })
  const dailyTitle = await page.textContent('[data-testid="home-daily"] b')
  if (!dailyTitle) fail('首頁沒有今日任務')
  ok(`首頁載入，今日任務：${dailyTitle}`)

  // 2. 教學：進第一課、標記完成、回列表看 ✓
  console.log('== 教學 ==')
  await page.goto(`${BASE_URL}#learn`)
  await page.waitForSelector('[data-testid="lesson-item"]')
  const lessonCount = await page.locator('[data-testid="lesson-item"]').count()
  if (lessonCount < 28) fail(`課程數 ${lessonCount} < 28`)
  await page.locator('[data-testid="lesson-item"]').first().click()
  await page.waitForSelector('[data-testid="lesson-done"]')
  await page.click('[data-testid="lesson-done"]')
  const doneText = await page.textContent('[data-testid="lesson-done"]')
  if (!doneText.includes('已完成')) fail('標記完成沒生效')
  await page.goto(`${BASE_URL}#learn/composition`)
  await page.waitForSelector('.num.done')
  ok(`${lessonCount} 課；標記完成 → 列表顯示 ✓`)
  // 壞 lessonId 回列表
  await page.goto(`${BASE_URL}#learn/not-a-lesson`)
  await page.waitForSelector('[data-testid="lesson-item"]')
  ok('壞 lessonId 回列表')

  // 3. 評分：注入合成圖（左暗右亮＋歪斜地平線）
  console.log('== 評分 ==')
  await page.goto(`${BASE_URL}#score`)
  await page.waitForSelector('[data-testid="upload-box"]')
  await page.evaluate(() => {
    window.__mockVision = async () => ({ ok: true, critique: { overall: 7, subject: '測試主體', mood: '安靜', strengths: ['留白乾淨'], improvements: [{ principle: 'horizon-level', text: '地平線拉直' }], nextShot: '蹲低一點', model: 'mock' } })
  })
  const png = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 800; c.height = 600
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#7fb0ff'; ctx.fillRect(0, 0, 800, 600)
    ctx.save(); ctx.translate(400, 330); ctx.rotate((6 * Math.PI) / 180); ctx.fillStyle = '#3a5a2a'; ctx.fillRect(-800, 0, 1600, 800); ctx.restore()
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 800, 40)
    ctx.fillStyle = '#e8402a'; ctx.beginPath(); ctx.arc(533, 200, 50, 0, Math.PI * 2); ctx.fill()
    return c.toDataURL('image/png')
  })
  const buf = Buffer.from(png.split(',')[1], 'base64')
  await page.setInputFiles('[data-testid="file-input"]', { name: 'test.png', mimeType: 'image/png', buffer: buf })
  await page.waitForSelector('[data-testid="local-score"]', { timeout: 15000 })
  const score = Number(await page.textContent('[data-testid="local-score"]'))
  if (!(score >= 0 && score <= 100)) fail(`本機分數異常 ${score}`)
  const hintText = await page.locator('[data-testid="local-report"]').textContent()
  if (!hintText.includes('水平')) fail('報告沒有水平指標')
  ok(`本機分析出分 ${score}`)
  // 疊圖切換
  await page.click('[data-testid="overlay-ctl"] button[data-kind="spiral"]')
  const pathCount = await page.locator('.overlay path').count()
  if (pathCount < 1) fail('黃金螺旋沒畫出來')
  await page.click('[data-testid="overlay-ctl"] button[data-kind="thirds"]')
  const lineCount = await page.locator('.overlay line').count()
  if (lineCount < 4) fail(`三分線只有 ${lineCount} 條`)
  ok('疊圖切換（螺旋/三分線）')
  // AI mock
  await page.click('[data-testid="ai-run"]')
  await page.waitForSelector('[data-testid="ai-critique"]', { timeout: 5000 })
  const crit = await page.textContent('[data-testid="ai-critique"]')
  if (!crit.includes('測試主體') || !crit.includes('水平線')) fail('AI 講評內容沒渲染')
  ok('AI 講評（mock）渲染')
  await page.screenshot({ path: `${SHOTS}/score.png`, fullPage: true })
  // 存作品集
  await page.click('[data-testid="save-entry"]')
  await page.waitForSelector('button:has-text("已存進作品集")', { timeout: 5000 })
  await page.goto(`${BASE_URL}#gallery`)
  await page.waitForSelector('[data-testid="gallery-grid"] button')
  ok('存進作品集並在作品牆出現')
  await page.screenshot({ path: `${SHOTS}/gallery.png`, fullPage: true })

  // 3b. 沒 key、沒 mock → 外包鍵；貼 JSON 解析
  console.log('== 外包鍵 ==')
  await page.goto(`${BASE_URL}#score`)
  await page.reload()
  await page.waitForSelector('[data-testid="upload-box"]')
  await page.setInputFiles('[data-testid="file-input"]', { name: 'test.png', mimeType: 'image/png', buffer: buf })
  await page.waitForSelector('[data-testid="local-score"]', { timeout: 15000 })
  if ((await page.locator('[data-testid="ai-run"]').count()) !== 0) fail('沒 key 不該出現直接講評鈕')
  await page.click('[data-testid="ai-external-toggle"]')
  await page.waitForSelector('[data-testid="external-panel"]')
  await page.click('[data-testid="copy-prompt"]')
  const clip = await page.evaluate(() => navigator.clipboard.readText())
  if (!clip.includes('overall') || !clip.includes('rule-of-thirds')) fail('複製的指令不含 schema/原則 id')
  await page.fill('[data-testid="paste-box"]', '```json\n{"overall": 6, "subject":"路燈","mood":"冷","strengths":["色調一致"],"improvements":[{"principle":"rule-of-thirds","text":"往左半步"},{"principle":"bogus","text":"x"}],"nextShot":"等人走進來"}\n```')
  await page.click('[data-testid="parse-btn"]')
  await page.waitForSelector('[data-testid="ai-critique"]')
  const ext = await page.textContent('[data-testid="ai-critique"]')
  if (!ext.includes('路燈') || !ext.includes('三分法')) fail('外包貼回解析失敗')
  ok('外包鍵：複製指令含 schema、貼回 JSON（含 code fence 與未知原則）解析成功')

  // 4. 鑑賞測驗
  console.log('== 鑑賞測驗 ==')
  await page.goto(`${BASE_URL}#quiz/variant`)
  await page.waitForSelector('[data-testid="choice-left"]', { timeout: 90000 })
  const before = await page.evaluate(() => JSON.stringify(window.__dojo.srs))
  const goodLeft = (await page.getAttribute('[data-testid="choice-left"]', 'data-good')) === '1'
  // 故意答錯
  await page.click(goodLeft ? '[data-testid="choice-right"]' : '[data-testid="choice-left"]')
  await page.waitForSelector('[data-testid="explain"]')
  const ex = await page.textContent('[data-testid="explain"]')
  if (!ex.includes('差在這裡')) fail('答錯沒顯示解析')
  if (!ex.includes('Wikimedia Commons')) fail('解析沒署名')
  const after = await page.evaluate(() => JSON.stringify(window.__dojo.srs))
  if (before === after) fail('答錯後 SRS 沒變')
  const item1 = await page.evaluate(() => window.__dojo.item)
  const wrongP = item1.principle
  const srsNow = await page.evaluate(() => window.__dojo.srs)
  if (!srsNow[wrongP] || srsNow[wrongP].wrong !== 1 || srsNow[wrongP].box !== 0) fail(`答錯原則 ${wrongP} 應 box0/wrong1：${JSON.stringify(srsNow[wrongP])}`)
  ok(`答錯 → 解析＋署名；SRS ${wrongP} 進 box 0`)
  await page.screenshot({ path: `${SHOTS}/quiz-answered.png`, fullPage: true })
  // 換題：圖或壞法要變
  await page.click('[data-testid="next-btn"]')
  await page.waitForSelector('[data-testid="choice-left"]:not([disabled])', { timeout: 90000 })
  const item2 = await page.evaluate(() => window.__dojo.item)
  if (item1.id === item2.id) fail('換題後題目 id 相同')
  ok('換一題 id 變化')
  // 鍵盤答對
  const goodLeft2 = (await page.getAttribute('[data-testid="choice-left"]', 'data-good')) === '1'
  await page.keyboard.press(goodLeft2 ? '1' : '2')
  await page.waitForSelector('[data-testid="explain"]')
  const q = await page.evaluate(() => window.__dojo.quiz)
  if (q.total !== 2 || q.correct !== 1) fail(`quiz 計數應 2/1：${JSON.stringify(q)}`)
  ok('鍵盤 1/2 作答、計數正確')
  // 真實對比題
  await page.goto(`${BASE_URL}#quiz/pair`)
  await page.reload()
  await page.waitForSelector('[data-testid="choice-left"]', { timeout: 30000 })
  const pairItem = await page.evaluate(() => window.__dojo.item)
  if (pairItem.kind !== 'pair') fail('pair 模式沒出對比題')
  ok('真實對比題出題')

  // 5. 每日任務決定性 + 壞日期
  console.log('== 每日任務 ==')
  await page.goto(`${BASE_URL}#daily/2026-03-01`)
  await page.waitForSelector('[data-testid="daily-challenge"] h2')
  const d1 = await page.textContent('[data-testid="daily-challenge"] h2')
  await page.reload()
  await page.waitForSelector('[data-testid="daily-challenge"] h2')
  const d2 = await page.textContent('[data-testid="daily-challenge"] h2')
  if (d1 !== d2) fail(`每日任務不決定性 ${d1} / ${d2}`)
  await page.goto(`${BASE_URL}#daily/2026-03-02`)
  await page.waitForSelector('[data-testid="daily-challenge"] h2')
  await page.goto(`${BASE_URL}#daily/garbage`)
  await page.waitForSelector('[data-testid="daily-date"]')
  const dd = await page.textContent('[data-testid="daily-date"]')
  if (!dd.includes('今天')) fail('壞日期應回今天')
  ok(`每日任務決定性（${d1}）、壞日期回今天`)

  // 6. 進度頁
  console.log('== 進度 ==')
  await page.goto(`${BASE_URL}#stats`)
  await page.waitForSelector('[data-testid="radar"]')
  const radarRows = await page.locator('[data-testid="radar"] .r').count()
  if (radarRows !== 22) fail(`原則列 ${radarRows} ≠ 22`)
  ok('進度頁 22 原則列')
  await page.screenshot({ path: `${SHOTS}/stats.png`, fullPage: true })

  // 7. GoatCounter 隱私：path 不含 hash/query
  console.log('== 隱私 ==')
  await page.goto(`${BASE_URL}?x=1#learn/composition-rule-of-thirds`)
  const gcPath = await page.evaluate(() => window.goatcounter.path())
  if (gcPath.includes('#') || gcPath.includes('?')) fail(`goatcounter path 洩漏：${gcPath}`)
  ok(`goatcounter path = ${gcPath}`)

  // 8. 手機版面截圖（親眼看）
  const m = await context.newPage()
  await m.setViewportSize({ width: 390, height: 844 })
  await m.goto(BASE_URL)
  await m.waitForSelector('.hero-title')
  await m.screenshot({ path: `${SHOTS}/home-mobile.png`, fullPage: true })
  await m.goto(`${BASE_URL}#quiz/variant`)
  await m.waitForSelector('[data-testid="choice-left"]', { timeout: 90000 })
  await m.screenshot({ path: `${SHOTS}/quiz-mobile.png`, fullPage: true })
  await m.close()

  if (fails.length) { console.error(`\n${fails.length} FAIL(S):\n- ${fails.join('\n- ')}`) } else console.log('\nALL E2E CHECKS PASSED ✅')
} catch (e) {
  console.error('E2E 中斷：', e)
  process.exitCode = 1
} finally {
  if (browser) await browser.close().catch(() => {})
  server.kill()
}
