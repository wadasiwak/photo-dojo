// 全頁截圖（桌面 1280×800＋行動 390×844）到 /tmp/photo-shots/。
// 需先 npm run build；自行啟動 vite preview（port 5362）。
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'

const PORT = 5362
const BASE_URL = `http://localhost:${PORT}/`
const OUT = '/tmp/photo-shots'
mkdirSync(OUT, { recursive: true })

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: new URL('..', import.meta.url).pathname,
  stdio: 'ignore',
})

const PAGES = [
  ['home', ''],
  ['learn', '#learn'],
  ['lesson', '#learn/composition-rule-of-thirds'],
  ['score', '#score'],
  ['quiz', '#quiz'],
  ['daily', '#daily'],
  ['gallery', '#gallery'],
  ['stats', '#stats'],
  ['settings', '#settings'],
]

let browser
try {
  for (let i = 0; i < 30; i++) {
    try {
      await fetch(BASE_URL)
      break
    } catch {
      await new Promise((r) => setTimeout(r, 300))
    }
  }
  browser = await chromium.launch()
  for (const [label, viewport] of [
    ['desktop', { width: 1280, height: 800 }],
    ['mobile', { width: 390, height: 844 }],
  ]) {
    const page = await browser.newPage({ viewport })
    for (const [name, hash] of PAGES) {
      await page.goto(`${BASE_URL}${hash}`)
      await page.waitForTimeout(500)
      await page.screenshot({ path: join(OUT, `${name}-${label}.png`), fullPage: true })
      console.log(`${name}-${label}.png`)
    }
    await page.close()
  }
} finally {
  if (browser) await browser.close().catch(() => {})
  server.kill()
}
