// photo-dojo 內容 schema。
// 所有內容檔都是 plain literals, designed to be LLM-generatable：
// 每個欄位的中文語意、字數範圍、枚舉白名單都寫在這裡——這個檔就是內容 agent 的 prompt 文件。
//
// ── 語氣鐵則（寫進每個內容 agent prompt）──
// - 繁體中文、台灣用語（手機拍照＝「手機」不是「手提電話」；曝光補償、人像模式、夜景模式）。
// - 讀者：想把日常照片拍好看的一般人，手機為主；相機觀念放 cameraNotes，不強迫。
// - 具體可操作：「蹲下來讓鏡頭跟小孩眼睛同高」勝過「注意視角」。
// - 禁模板句、禁「總之」「綜上所述」、禁空話（「多練習就會進步」）。
// - 不抄任何書籍/網站段落；原則是公共知識，文字要自撰。
// - 只准引用 principles.ts 的 PrincipleId，不得發明新 id。

import type { PrincipleId } from './principles.ts'
export type { PrincipleId } from './principles.ts'
export { PRINCIPLE_IDS, PRINCIPLES, isPrincipleId } from './principles.ts'

// ─────────────────────────────────────────────────────────
// A. 教學課程
// ─────────────────────────────────────────────────────────

/** 章節 id（同時是檔名 src/content/lessons/<chapter>.ts） */
export const CHAPTER_IDS = ['composition', 'light', 'exposure', 'color', 'scenes'] as const
export type ChapterId = (typeof CHAPTER_IDS)[number]

export const CHAPTERS: Record<ChapterId, { title: string; emoji: string; blurb: string; lessonCount: number }> = {
  composition: { title: '構圖', emoji: '▦', blurb: '把東西放對位置，照片就先贏一半', lessonCount: 8 },
  light: { title: '光線', emoji: '🌅', blurb: '攝影是用光作畫，先學會看光', lessonCount: 5 },
  exposure: { title: '曝光與手機設定', emoji: '☀', blurb: '亮暗對了，細節才留得住', lessonCount: 5 },
  color: { title: '色彩與後製', emoji: '🎨', blurb: '顏色是情緒，後製是收尾不是救援', lessonCount: 4 },
  scenes: { title: '場景實戰', emoji: '📷', blurb: '人像、美食、風景、街拍、夜景、寵物', lessonCount: 6 },
}

export interface Lesson {
  /** 格式 `<chapter>-<slug>`，slug 為小寫英文＋連字號，例 `composition-rule-of-thirds`；全站唯一 */
  id: string
  chapter: ChapterId
  /** 課名 4–14 字，例「三分法：別再把主體放正中間」 */
  title: string
  /** 一段摘要 40–80 字，說這課學完能做到什麼 */
  summary: string
  /** 內文段落陣列，4–8 段、每段 80–220 字、全文 600–1200 字。第一段先講「為什麼」，中段講「怎麼做」，末段講「什麼時候可以故意違反」 */
  body: string[]
  /** 手機實作提示 3–5 條，每條 20–60 字，要具體到手指按哪裡（例「相機設定開九宮格線」） */
  phoneTips: string[]
  /** 相機觀念補充 0–3 條，每條 20–70 字（光圈/快門/焦段等）；此課無相機面向可給空陣列 */
  cameraNotes: string[]
  /** 常見錯誤 2–4 條，每條 15–50 字，寫「症狀 → 原因」 */
  commonMistakes: string[]
  /** 練習任務 */
  exercise: {
    /** 任務描述 30–90 字，今天就能在家或住家附近做 */
    task: string
    /** 自評檢核 3–5 條，每條 10–35 字，能用「是/否」回答 */
    checklist: string[]
  }
  /** 本課對應原則 1–3 個，第一個是主原則 */
  relatedPrinciples: PrincipleId[]
}

// ─────────────────────────────────────────────────────────
// B. 每日拍照任務
// ─────────────────────────────────────────────────────────

export interface Challenge {
  /** 格式 `ch-<slug>`，全站唯一 */
  id: string
  /** 任務名 3–10 字，例「框中框」「一種顏色」 */
  title: string
  /** 任務說明 40–110 字：拍什麼、怎麼判斷有沒有做到 */
  brief: string
  /** 小提示 2–3 條，每條 15–50 字 */
  tips: string[]
  /** 練的原則 1–2 個 */
  principles: PrincipleId[]
  /** 難度 1 簡單（在家就能）／2 中等（要出門或等光）／3 進階 */
  difficulty: 1 | 2 | 3
  /** 室內能不能完成（下雨天篩選用） */
  indoorOk: boolean
}

// ─────────────────────────────────────────────────────────
// C. Wikimedia Commons 精選圖池（鑑賞題「同圖變體」的好圖來源）
// ─────────────────────────────────────────────────────────

/** 授權白名單：只收 CC0 / Public domain / CC BY x.x / CC BY-SA x.x；任何含 NC 或 ND 的一律不收 */
export type CommonsLicense = string

/** 來源標籤——變體引擎用來判斷哪些壞法適用（例：無地平線的人像不出「歪斜」題） */
export const SOURCE_TAGS = [
  'horizon', // 有明確地平線/海平面/水平參考線
  'architecture', // 建築、有明確垂直/水平線
  'portrait', // 人或動物特寫為主體
  'food', // 食物/靜物
  'landscape', // 風景（含城市遠景）
  'night', // 夜景/低光
  'bw', // 黑白照
  'highkey', // 高調（整體偏亮、白背景）
  'lowkey', // 低調（整體偏暗、剪影）
  'symmetric', // 明顯對稱構圖
  'centered', // 主體刻意置中
  'busy', // 畫面元素多、紋理密（森林、人群、市場）
  'minimal', // 極簡、大量留白
] as const
export type SourceTag = (typeof SOURCE_TAGS)[number]

export const POOL_CATEGORIES = ['landscape', 'architecture', 'people-animals', 'still-life'] as const
export type PoolCategory = (typeof POOL_CATEGORIES)[number]

export interface CommonsImage {
  /** 格式 `img-<category>-NNN`（三位數，從 001 起），全站唯一 */
  id: string
  category: PoolCategory
  /** 圖名（Commons File: 名去掉副檔名，或自訂 5–30 字中文描述） */
  title: string
  /** API 給的 960px thumburl（或 url），必須是 https://upload.wikimedia.org/…；禁止手改寬度數字 */
  src: string
  /** 原圖像素尺寸（API imageinfo width/height），供版面預留比例 */
  width: number
  height: number
  /** 作者（extmetadata Artist 去 HTML 後前 80 字；查不到寫 'unknown'） */
  author: string
  /** extmetadata LicenseShortName，例 'CC BY-SA 4.0' / 'CC0' / 'Public domain' */
  license: CommonsLicense
  /** extmetadata LicenseUrl；沒有就 'https://commons.wikimedia.org/wiki/Commons:Licensing' */
  licenseUrl: string
  /** File: 頁 descriptionurl */
  sourceUrl: string
  /** 來源標籤 1–4 個，人審判斷 */
  tags: SourceTag[]
  /** 這張為什麼是好照片（50–120 字，點出 2–3 個原則怎麼落實） */
  whyGood: string
  /** 它體現的原則 1–3 個 */
  principles: PrincipleId[]
}

// ─────────────────────────────────────────────────────────
// D. Commons 真實好壞對比題（補充題型）
// ─────────────────────────────────────────────────────────

export interface ComparisonPair {
  /** 格式 `pair-NNN` */
  id: string
  /** 主題 3–12 字，例「海邊日落」「街角咖啡店」 */
  theme: string
  /** 較好的一張 */
  good: Omit<CommonsImage, 'category' | 'tags' | 'whyGood' | 'principles'>
  /** 較弱的一張（同主題、同授權白名單；「弱」是相對於 good，不是爛照片） */
  weak: Omit<CommonsImage, 'category' | 'tags' | 'whyGood' | 'principles'>
  /** 差別出在哪些原則 1–3 個 */
  principles: PrincipleId[]
  /** 解析 80–200 字：先講 good 做對什麼，再講 weak 差在哪，語氣尊重原作者（Commons 圖都是別人的作品） */
  explanation: string
}

// ─────────────────────────────────────────────────────────
// 共用常數
// ─────────────────────────────────────────────────────────

export type VisionModel = 'precise' | 'fast'
export const VISION_MODEL_ID: Record<VisionModel, string> = {
  precise: 'claude-sonnet-5',
  fast: 'claude-haiku-4-5',
}
