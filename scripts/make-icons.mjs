// 用 playwright 把 favicon.svg 轉成 PWA icon（192/512）＋ apple-touch-icon（180）
// ＋ og-image（1200×630）。改 favicon.svg 後重跑 `npm run icons`。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'

const root = new URL('..', import.meta.url).pathname
const svg = readFileSync(join(root, 'public/favicon.svg'), 'utf8')

const browser = await chromium.launch()
const page = await browser.newPage()

async function shot(html, width, height, out) {
  await page.setViewportSize({ width, height })
  await page.setContent(`<!doctype html><html><body style="margin:0">${html}</body></html>`)
  await page.screenshot({ path: join(root, 'public', out) })
  console.log(`public/${out}`)
}

const iconHtml = (size) => `<div style="width:${size}px;height:${size}px">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</div>`
await shot(iconHtml(192), 192, 192, 'icon-192.png')
await shot(iconHtml(512), 512, 512, 'icon-512.png')
await shot(iconHtml(180), 180, 180, 'apple-touch-icon.png')

const og = `
  <div style="width:1200px;height:630px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;
    background:radial-gradient(800px 400px at 85% -10%, rgba(240,179,90,.16), transparent 60%),
      radial-gradient(700px 420px at 0% 110%, rgba(124,196,255,.12), transparent 60%), #0f1115;
    font-family:'PingFang TC','Noto Sans TC',sans-serif;color:#e6e8ef">
    <div style="width:120px;height:120px">${svg.replace('<svg ', '<svg width="120" height="120" ')}</div>
    <div style="font-size:76px;letter-spacing:18px;color:#f0b35a;font-weight:700">攝影道場</div>
    <div style="font-size:30px;letter-spacing:6px;color:#a5adc2">練出好照片的眼與手</div>
    <div style="font-size:24px;letter-spacing:3px;color:#7cc4ff">手機攝影教學 📖 照片評分 📷 哪張好看 👀 每日任務 📅</div>
  </div>`
await shot(og, 1200, 630, 'og-image.png')

await browser.close()
