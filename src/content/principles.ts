// 攝影原則註冊表（全站 canonical id）。
// 教學課程 relatedPrinciples、每日任務 principles、本機分析 hints、變體壞法、Commons 對比題
// 全部只准引用這裡的 id——內容 agent「MUST use these exact ids. Do not invent.」
// check-content.mjs 會驗：每個 id 至少被 1 課引用；分析/變體引擎引用的 id 都存在。

export const PRINCIPLE_IDS = [
  // ── 構圖 ──
  'rule-of-thirds', // 三分法：主體放在三分線交點附近
  'subject-placement', // 主體位置與完整：別貼邊、別切頭切腳、給視線方向留空間
  'leading-lines', // 引導線：道路、欄杆、光影線把視線帶向主體
  'negative-space', // 留白：大面積乾淨區域襯托主體
  'framing', // 框中框：門窗、樹枝、拱門當前景框
  'symmetry', // 對稱與圖案：倒影、建築、重複元素
  'horizon-level', // 水平線：地平線/海平面要平，垂直線要直
  'perspective', // 視角與高度：蹲低、俯拍、貼地、換角度
  'depth-layers', // 前中後景層次：用前景帶出空間感
  'simplify', // 簡化與減法：清掉雜物、換乾淨背景、靠近一點
  // ── 光線 ──
  'golden-hour', // 光線時段與光質：黃金時刻、藍調、陰天柔光 vs 正午硬光
  'light-direction', // 光的方向：順光/側光/逆光/頂光各自效果
  'shutter-motion', // 快門與動態：凝結 vs 拖影、手震、長曝
  'depth-of-field', // 景深與散景：人像模式、對焦距離、背景距離
  // ── 曝光 ──
  'exposure', // 曝光：亮部過曝/暗部死黑、曝光補償、點測光
  'dynamic-range', // 對比與動態範圍：HDR、逆光大反差處理、平光霧感
  // ── 色彩 ──
  'white-balance', // 白平衡與色偏：偏黃/偏藍/室內混光
  'color-harmony', // 色彩搭配：單色、相近色、互補色、限制色數
  'saturation', // 飽和度：過飽和塑膠感 vs 低飽和質感
  // ── 技術與瞬間 ──
  'sharpness', // 對焦與清晰：對焦點在眼睛、鏡頭乾淨、穩定持機
  'noise', // 雜訊與 ISO：夜拍顆粒、夜景模式
  'moment', // 決定性瞬間：表情、動作、等待與預判
] as const

export type PrincipleId = (typeof PRINCIPLE_IDS)[number]

export interface PrincipleMeta {
  id: PrincipleId
  /** 中文名（2–6 字） */
  name: string
  /** 一句話（15–40 字）說這條原則在講什麼 */
  oneLiner: string
  /** 分組，UI 分區顯示 */
  group: 'composition' | 'light' | 'exposure' | 'color' | 'technique'
  /** 圖示 emoji */
  emoji: string
}

export const PRINCIPLES: Record<PrincipleId, PrincipleMeta> = {
  'rule-of-thirds': { id: 'rule-of-thirds', name: '三分法', oneLiner: '把主體放在三分線交點附近，畫面比正中央更有張力。', group: 'composition', emoji: '▦' },
  'subject-placement': { id: 'subject-placement', name: '主體位置', oneLiner: '主體別貼邊、別被切掉，視線與動線前方留空間。', group: 'composition', emoji: '🎯' },
  'leading-lines': { id: 'leading-lines', name: '引導線', oneLiner: '用道路、欄杆、光影的線條把觀者視線帶到主體。', group: 'composition', emoji: '↗' },
  'negative-space': { id: 'negative-space', name: '留白', oneLiner: '大面積乾淨區域讓主體呼吸，畫面更安靜有力。', group: 'composition', emoji: '◻' },
  framing: { id: 'framing', name: '框中框', oneLiner: '拿門窗、樹枝、拱門當前景框，把視線鎖在主體上。', group: 'composition', emoji: '🖼' },
  symmetry: { id: 'symmetry', name: '對稱與圖案', oneLiner: '倒影、建築、重複元素做出秩序感，置中反而是對的。', group: 'composition', emoji: '⧉' },
  'horizon-level': { id: 'horizon-level', name: '水平線', oneLiner: '地平線要平、垂直線要直，歪一點整張就不安穩。', group: 'composition', emoji: '⎯' },
  perspective: { id: 'perspective', name: '視角高度', oneLiner: '蹲低、貼地、俯拍——換一個高度就是另一張照片。', group: 'composition', emoji: '📐' },
  'depth-layers': { id: 'depth-layers', name: '前中後景', oneLiner: '放一個前景，畫面立刻有深度與空間感。', group: 'composition', emoji: '⛰' },
  simplify: { id: 'simplify', name: '簡化減法', oneLiner: '清掉雜物、靠近一點、換乾淨背景，少即是多。', group: 'composition', emoji: '✂' },
  'golden-hour': { id: 'golden-hour', name: '光線時段', oneLiner: '黃金時刻與藍調時刻的柔光，勝過正午硬光。', group: 'light', emoji: '🌅' },
  'light-direction': { id: 'light-direction', name: '光的方向', oneLiner: '側光立體、逆光剪影輪廓光、順光平淡但保險。', group: 'light', emoji: '💡' },
  'shutter-motion': { id: 'shutter-motion', name: '快門動態', oneLiner: '凝結瞬間或拖出動感，手震是最常見的失敗。', group: 'light', emoji: '🏃' },
  'depth-of-field': { id: 'depth-of-field', name: '景深散景', oneLiner: '讓主體離背景遠一點、鏡頭靠近一點，背景自然虛化。', group: 'light', emoji: '🔮' },
  exposure: { id: 'exposure', name: '曝光', oneLiner: '亮部不要死白、暗部不要死黑，先顧主體的亮度。', group: 'exposure', emoji: '☀' },
  'dynamic-range': { id: 'dynamic-range', name: '對比動態', oneLiner: '大反差場景用 HDR 或補光，霧感平光靠後製拉對比。', group: 'exposure', emoji: '◑' },
  'white-balance': { id: 'white-balance', name: '白平衡', oneLiner: '白的東西要拍成白的，偏黃偏藍先看光源。', group: 'color', emoji: '⚖' },
  'color-harmony': { id: 'color-harmony', name: '色彩搭配', oneLiner: '限制畫面色數，用相近色或互補色讓照片有整體感。', group: 'color', emoji: '🎨' },
  saturation: { id: 'saturation', name: '飽和度', oneLiner: '過飽和像塑膠，稍微收一點更有質感。', group: 'color', emoji: '🌈' },
  sharpness: { id: 'sharpness', name: '對焦清晰', oneLiner: '對焦點放眼睛、擦鏡頭、手肘夾緊，清晰是基本分。', group: 'technique', emoji: '🔍' },
  noise: { id: 'noise', name: '雜訊 ISO', oneLiner: '夜拍顆粒來自高 ISO，用夜景模式或找光源。', group: 'technique', emoji: '🌌' },
  moment: { id: 'moment', name: '決定性瞬間', oneLiner: '表情、動作、光線交會的那一刻，靠等待與預判。', group: 'technique', emoji: '⚡' },
}

export const PRINCIPLE_ID_SET: ReadonlySet<string> = new Set(PRINCIPLE_IDS)
export const isPrincipleId = (s: string): s is PrincipleId => PRINCIPLE_ID_SET.has(s)
