# 攝影道場 photo-dojo

練出好照片的眼與手。手機為主的攝影練習網站：教學、照片評分、「哪張好看」鑑賞測驗、每日拍照任務與作品集。免下載、免註冊、無廣告；照片與進度只存在你的裝置。

🌐 https://wadasiwak.github.io/photo-dojo/

## 功能

- **📖 拍照教學 28 課**：構圖 8、光線 5、曝光與手機設定 5、色彩與後製 4、場景實戰 6（人像/美食/風景/街拍/夜景/寵物）。每課附手機操作、相機觀念、常見錯誤、練習任務與自評檢核。
- **📷 照片評分（雙軌）**
  - 本機分析：瀏覽器內純演算法量測曝光、清晰度、三分構圖、水平線傾斜、色彩和諧/色偏、留白、引導線、雜訊、對稱——附構圖輔助疊圖（三分線/黃金螺旋/對角線/中心）與主體質心點。明示為「客觀指標參考」，判讀信心低的指標灰顯。
  - AI 講評：自備 Anthropic API key 瀏覽器直打 Claude（Sonnet 5 / Haiku 4.5 可切），或免費「外包鍵」——複製結構化指令＋照片貼給任何 AI，再把回覆貼回解析。
- **👀 哪張好看？** 二選一鑑賞測驗。主力題型「同圖找茬」：從 Wikimedia Commons 精選圖即時生成壞版本（歪斜/過曝/過暗/切主體/死板置中/去飽和/色偏/模糊/雜訊，各綁一個攝影原則、三難度）；補充題型「真實對比」：同主題兩張真實作品。答錯的原則會更常出題（Leitner 三箱 SRS），有等級、連勝、22 原則正確率。
- **📅 每日拍照任務**：60 題任務庫，日期決定當天題目（全球同一天同一題），交作業進作品集，連續天數。
- **🖼 作品集**：照片存 IndexedDB，含本機分數、AI 講評、筆記、分數軌跡；可匯出/匯入備份。

## 開發

```
npm install
npm run dev        # http://localhost:5360
npm test           # 引擎單元測試（vitest）
npm run check      # 內容驗證
npm run build && npm run e2e
```

詳見 `.claude/skills/verify/SKILL.md` 與 `docs/ENGINE-DESIGN.md`。

## 技術

Vite + React 19 + TypeScript + zustand，無後端。兩個純前端引擎：`src/lib/analyze/`（照片客觀指標）與 `src/lib/variants/`（確定性壞版本生成），核心不碰 canvas，以合成圖在 node 做單元測試。

## 版權與授權

- **程式碼與原創內容文字**（教學、任務、解析、原則說明）：© 2026 wadasiwak. All rights reserved.
- **鑑賞題圖片**：來自 Wikimedia Commons 精選/優質圖片，僅收 CC0 / 公有領域 / CC BY / CC BY-SA 授權，網站依各圖授權於題目解析處署名並連回來源頁。圖片不存於本 repo，僅存 URL 與署名資料（`src/content/pool/`、`src/content/pairs.ts`）。
- 本站評分為練習參考，不代表美感評價；使用者上傳的照片只在本機處理，僅在使用者主動按下 AI 講評時送往其自選的服務。
