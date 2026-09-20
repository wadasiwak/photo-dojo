---
name: verify
description: 驗證 photo-dojo（攝影道場）改動——啟動指令、內容管線、引擎單元測試、e2e、截圖流程與踩雷筆記
---

# photo-dojo 驗證流程

## 指令表

| 事項 | 指令 |
|---|---|
| dev | `npm run dev`（port **5360**） |
| 內容驗證 | `npm run check`（單檔：`npm run check -- src/content/lessons/light.ts`） |
| 引擎單元測試 | `npm test`（vitest，node 環境、合成圖，raster/analyze/variants） |
| build | `npm run build`（tsc -b + vite build；⚠️ 不要 `build \| grep`，會吞 exit code） |
| e2e | `npm run build && npm run e2e`（自起 preview **5361**；鑑賞題真抓 Commons 圖需網路，截圖在 /tmp/photo-e2e） |
| 截圖 | `npm run shots`（port **5362**，輸出 `/tmp/photo-shots/`，**必須 Read 親眼看**） |
| icons | `npm run icons`（改 favicon.svg 後重跑；需 `npx playwright install chromium`） |

## 內容管線

- `src/content/types.ts` = schema 兼內容 agent prompt 文件；`principles.ts` = 22 個 canonical id 註冊表（全站只准引用這些）。
- 課程 5 章（8/5/5/4/6）自包含檔 `lessons/<chapter>.ts`；挑戰 60 題 `challenges.ts`；Commons 圖池 `pool/*.ts`（兩批）；對比題 `pairs.ts`。
- check 驗：字數/枚舉/id 格式/原則覆蓋（每原則 ≥1 課、每原則 ≥2 挑戰）、授權白名單（先擋 NC/ND）、src host、tags、horizon ≥8 張。需 node ≥ 23（直 import .ts；**value import 要帶 `.ts` 副檔名**，type import 不用）。
- 引擎設計文件 `docs/ENGINE-DESIGN.md`；門檻在 `src/lib/analyze/thresholds.ts` 與 `src/lib/variants/registry.ts`。

## 踩雷筆記

- **Commons 圖要 `crossOrigin='anonymous'`** 才能畫進 canvas 讀像素（upload.wikimedia.org 有 CORS `*`）；縮圖 URL 寬度數字不可手改（WMF 白名單 → 400）。
- 鑑賞題 good 圖若 variant 回 `cropApplied`（tilt 類），要套同樣裁切再縮回原尺寸，否則「內容多的是好圖」洩題。
- `window.__mockVision` 攔 AI 講評（e2e）；沒 key 且沒 mock 時評分頁只出外包鍵，不出直接講評鈕（e2e 釘住）。
- API key 存 `photo-dojo-apikey-v1`，備份檔絕不含；進度 `photo-dojo-progress-v1`（partialize 不存 view）。
- 照片 blob 在 IndexedDB `photo-dojo-photos`，作品牆用 240px dataURL 縮圖免開 DB。
- `window.__dojo` e2e hook 暴露 item/picked/srs/quiz。
- GoatCounter `path` 只回報 pathname（hash 含課程/題目），e2e 有釘。
