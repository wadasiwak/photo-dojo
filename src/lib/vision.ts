// 照片 → Anthropic vision 講評。瀏覽器直打（BYO API key，key 只存本機 localStorage，絕不進備份檔）。
// e2e 用 window.__mockVision 攔截，零真實呼叫。抄自 ldl-diet/src/lib/vision.ts。
import Anthropic from '@anthropic-ai/sdk'
import { API_KEY_STORAGE, useApp, type AiCritique } from '../state.ts'
import { PRINCIPLE_IDS, PRINCIPLES, isPrincipleId, type PrincipleId } from '../content/principles.ts'
import { VISION_MODEL_ID } from '../content/types.ts'

export interface CritiqueOk { ok: true; critique: AiCritique }
export interface CritiqueError {
  ok: false
  kind: 'no-key' | 'bad-key' | 'rate-limit' | 'offline' | 'refused' | 'parse' | 'other'
  message: string
  retryAfterSec?: number
}
export type CritiqueOutcome = CritiqueOk | CritiqueError

declare global {
  interface Window {
    __mockVision?: (base64: string) => CritiqueOutcome | Promise<CritiqueOutcome>
  }
}

export const getApiKey = () => localStorage.getItem(API_KEY_STORAGE) ?? ''
export function setApiKey(key: string) {
  if (key.trim()) localStorage.setItem(API_KEY_STORAGE, key.trim())
  else localStorage.removeItem(API_KEY_STORAGE)
}

/** 照片壓縮：EXIF 方向校正 + 縮到長邊 maxSide + JPEG。回傳 base64（無前綴）、blob、以及 bitmap 供本機分析。 */
export async function compressPhoto(file: File | Blob, maxSide = 1280): Promise<{ base64: string; blob: Blob; canvas: HTMLCanvasElement }> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('這個圖片格式無法處理（可能是 HEIC）。請改用手機相簿分享成 JPG，或截圖後再上傳。')
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('照片壓縮失敗'))), 'image/jpeg', 0.85))
  return { base64, blob, canvas }
}

const CRITIQUE_SCHEMA = {
  type: 'object',
  properties: {
    overall: { type: 'integer', minimum: 1, maximum: 10, description: '整體 1–10 分' },
    subject: { type: 'string', description: '主體是什麼（10 字內）' },
    mood: { type: 'string', description: '氛圍一句（15 字內）' },
    strengths: { type: 'array', items: { type: 'string' }, description: '做得好的 2–3 點，每點 20–50 字，點名原則' },
    improvements: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          principle: { type: 'string', enum: [...PRINCIPLE_IDS] },
          text: { type: 'string', description: '具體可操作的改進動作 25–70 字，例「往左移半步讓路燈落在右三分線」' },
        },
        required: ['principle', 'text'],
        additionalProperties: false,
      },
      description: '最重要的 2–3 個改進點，每點綁一個原則 id',
    },
    nextShot: { type: 'string', description: '下一張怎麼拍的一句建議 20–60 字' },
  },
  required: ['overall', 'subject', 'mood', 'strengths', 'improvements', 'nextShot'],
  additionalProperties: false,
} as const

function principleTable(): string {
  return PRINCIPLE_IDS.map((id) => `- ${id}：${PRINCIPLES[id].name}——${PRINCIPLES[id].oneLiner}`).join('\n')
}

export const CRITIQUE_PROMPT = `你是一位溫和但誠實的攝影老師，學生是用手機拍照的一般人。請講評這張照片。

規則：
- 先看主體與意圖，再談技術；先講優點（strengths），再講最重要的 2–3 個改進（improvements）。
- 每個改進點必須綁定下列原則 id 之一，並給「具體可操作的動作」（往哪移、蹲多低、點哪裡對焦、拉曝光滑桿哪個方向），不要抽象形容詞。
- overall 用 1–10：5 是普通生活照、7 已經有明確意圖與構圖、9 以上是罕見佳作。不要客套灌水。
- 如果照片刻意違反某原則且效果成立（刻意置中對稱、刻意剪影、刻意荷蘭角），要肯定它，不要當缺點。
- 用繁體中文、台灣用語，語氣像朋友。

原則表：
${principleTable()}`

/** 外包鍵貼回與 API 共用的解析防禦管線 */
export function parseCritiqueJson(text: string, model = 'external'): CritiqueOutcome {
  let t = text.trim().replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start < 0 || end <= start) return { ok: false, kind: 'parse', message: '看不懂剛剛貼的內容——請把 AI 回覆整段「全選複製」再貼一次。' }
  t = t.slice(start, end + 1)
  let raw: unknown
  try {
    raw = JSON.parse(t)
  } catch {
    return { ok: false, kind: 'parse', message: '內容不完整，請把 AI 的回覆整段重新複製貼上（不要只貼一部分）。' }
  }
  const o = raw as Record<string, unknown>
  const overallN = typeof o.overall === 'number' ? o.overall : Number(o.overall)
  if (!Number.isFinite(overallN)) return { ok: false, kind: 'parse', message: '回覆裡沒有分數——請確認有先貼「講評指令」＋照片給 AI。' }
  const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim()) : [])
  const improvements: AiCritique['improvements'] = []
  if (Array.isArray(o.improvements)) {
    for (const it of o.improvements as Array<Record<string, unknown>>) {
      if (!it || typeof it.text !== 'string' || !it.text.trim()) continue
      const p = typeof it.principle === 'string' && isPrincipleId(it.principle) ? (it.principle as PrincipleId) : 'simplify'
      improvements.push({ principle: p, text: it.text.trim() })
    }
  }
  return {
    ok: true,
    critique: {
      overall: Math.min(10, Math.max(1, Math.round(overallN))),
      subject: typeof o.subject === 'string' ? o.subject.slice(0, 40) : '',
      mood: typeof o.mood === 'string' ? o.mood.slice(0, 60) : '',
      strengths: strs(o.strengths).slice(0, 4),
      improvements: improvements.slice(0, 4),
      nextShot: typeof o.nextShot === 'string' ? o.nextShot.slice(0, 200) : '',
      model,
    },
  }
}

export async function critiquePhoto(base64: string): Promise<CritiqueOutcome> {
  if (window.__mockVision) return window.__mockVision(base64)
  const apiKey = getApiKey()
  if (!apiKey) return { ok: false, kind: 'no-key', message: '還沒設定 API 金鑰（設定頁有教學）。也可以用下面的「免費外包講評」。' }
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 0, timeout: 60_000 })
  const model = VISION_MODEL_ID[useApp.getState().visionModel ?? 'precise']
  try {
    const resp = await client.messages.create({
      model,
      max_tokens: 1500,
      output_config: { format: { type: 'json_schema', schema: CRITIQUE_SCHEMA as unknown as Record<string, unknown> } },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
            { type: 'text', text: CRITIQUE_PROMPT },
          ],
        },
      ],
    })
    if (resp.stop_reason === 'refusal') return { ok: false, kind: 'refused', message: '這張照片無法講評，請換一張。' }
    const text = resp.content.find((b) => b.type === 'text')
    if (!text || text.type !== 'text') return { ok: false, kind: 'parse', message: '沒有拿到講評，請再試一次。' }
    return parseCritiqueJson(text.text, model)
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return { ok: false, kind: 'bad-key', message: 'API key 無效，請到設定頁檢查。' }
    if (err instanceof Anthropic.RateLimitError) {
      const ra = Number(err.headers?.get?.('retry-after') ?? '30')
      return { ok: false, kind: 'rate-limit', message: `請求太頻繁，請 ${ra} 秒後再試。`, retryAfterSec: ra }
    }
    if (err instanceof Anthropic.APIConnectionError) return { ok: false, kind: 'offline', message: '目前連不上講評服務，可改用免費外包講評。' }
    return { ok: false, kind: 'other', message: `講評失敗：${err instanceof Error ? err.message : String(err)}` }
  }
}

export async function testApiKey(key: string): Promise<{ ok: boolean; message: string }> {
  const client = new Anthropic({ apiKey: key.trim(), dangerouslyAllowBrowser: true, maxRetries: 0, timeout: 20_000 })
  try {
    await client.messages.create({ model: 'claude-haiku-4-5', max_tokens: 8, messages: [{ role: 'user', content: 'hi' }] })
    return { ok: true, message: '連線成功，可以開始講評了！' }
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return { ok: false, message: 'key 無效（401）。' }
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}

/** 零 API 外包講評：使用者把這段 + 照片貼給任意 LLM，把回傳 JSON 貼回網站。 */
export function buildExternalPrompt(): string {
  return `請以攝影老師的角度講評這張照片（學生用手機拍、一般人）。只回傳 JSON、不要其他文字，格式：
{
  "overall": 1到10的整數,
  "subject": "主體（10字內）",
  "mood": "氛圍一句（15字內）",
  "strengths": ["做得好的 2–3 點，每點 20–50 字"],
  "improvements": [{ "principle": "原則id", "text": "具體可操作的改進動作 25–70 字" }],
  "nextShot": "下一張怎麼拍（20–60 字）"
}
原則 id 只能從這些選：${PRINCIPLE_IDS.join(', ')}。
評分基準：5 普通生活照、7 有明確意圖與構圖、9 以上罕見佳作，不要客套灌水；刻意違反原則且效果成立要肯定。繁體中文、台灣用語。`
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
