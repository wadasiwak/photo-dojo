// Engine 1 全部門檻。分數映射用 lerpScore 斷點表，讓門檻是資料而非程式碼。
// 依 docs/ENGINE-DESIGN.md §1。
import type { Breakpoints } from './scoring'

export const THRESHOLDS = {
  /** analyze 工作解析度長邊 */
  workSide: 320,
  /** sharpness / noise 用較高解析度 */
  detailSide: 480,

  exposure: {
    clipLowLevel: 8,
    clipHighLevel: 247,
    /** clipHigh % → 扣分 */
    clipHighPenalty: [[0.5, 0], [3, 25], [10, 60]] as Breakpoints,
    /** clipLow 同表但半權 */
    clipLowWeight: 0.5,
    /** |median − 118| → 扣分 */
    medianPenalty: [[30, 0], [70, 30], [100, 50]] as Breakpoints,
    medianTarget: 118,
    /** DR = p95 − p5 → 子分 */
    drScore: [[60, 30], [120, 80], [180, 100]] as Breakpoints,
    /** DR 子分只輕微拉動總分（最多扣 3.5）：flat 中灰 DR=0 仍需 ≥95 */
    drWeight: 0.05,
    hintClipHigh: 3,
    hintClipLow: 6,
    hintDrLow: 80,
    /** 雙峰判定：兩峰距離 > 15% 灰階、谷底 < 峰 20% → confidence 0.6 */
    bimodalPeakDist: 0.15,
    bimodalValleyRatio: 0.2,
    bimodalConfidence: 0.6,
  },

  saliency: {
    blurRadius: 5,
    blurPasses: 2,
    colorWeight: 0.5,
    /** 取能量前 20% 像素 */
    topFraction: 0.2,
    bboxLoPct: 5,
    bboxHiPct: 95,
  },

  thirds: {
    score: [[0.05, 100], [0.12, 75], [0.25, 40], [0.4, 15]] as Breakpoints,
    centerDist: 0.06,
    centerSymmetryScore: 70,
    centerFloor: 70,
    edgeDist: 0.08,
    /** bbox 觸邊：0–1 座標距邊 < 此值 */
    bboxTouch: 0.01,
    confidence: [[1.5, 0.2], [3, 1]] as Breakpoints,
  },

  horizon: {
    magPercentile: 60,
    maxAngle: 20,
    binDeg: 0.5,
    columns: 8,
    minColumns: 5,
    /** 取角度前先對 gx/gy 做 box blur（結構張量式平均），消掉抗鋸齒階梯造成的角度偏差 */
    gradientSmooth: 3,
    /** 峰 bin 像素沿法向的 p10–p90 散佈（/h）→ 信心係數：單一線很窄、紋理鋪滿 */
    spreadConf: [[0.15, 1], [0.4, 0]] as Breakpoints,
    score: [[0.7, 100], [2, 85], [4, 55], [7, 25], [12, 0]] as Breakpoints,
    strengthConf: [[0.08, 0], [0.25, 1]] as Breakpoints,
    nearShareConf: [[0.05, 0], [0.2, 1]] as Breakpoints,
    hintTilt: 2,
    hintConf: 0.5,
  },

  negativeSpace: {
    grid: 8,
    busyFactor: 1.2,
    /** 相對門檻之外的絕對「一定忙」門檻；純相對門檻在滿版紋理（checker）會把所有格都判成不忙 */
    busyAbsolute: 40,
    /** 近乎純平的圖中位 mag 為 0，1.2× 仍是 0，設絕對下限（約 2 灰階階梯） */
    busyFloor: 8,
    score: [[0.1, 40], [0.3, 80], [0.6, 100], [0.85, 70]] as Breakpoints,
    hintFull: 0.12,
    hintEmpty: 0.6,
    hintContig: 0.4,
    confidence: 0.8,
  },

  leadingLines: {
    thetaBins: 45,
    rhoStep: 4,
    magPercentile: 70,
    peaks: 5,
    /** 找到一條線後，把距線 ≤ 此 px 的支持像素票數全部扣掉（比 ±bin NMS 穩：斜線的峰會沿 θ 帶著 ρ 偏移） */
    suppressDist: 6,
    minLength: 0.25,
    /** 票數還要 ≥ 此比例 × min(w,h)：只看 length 比值時，圓形邊緣的切線、角落短線會混進來 */
    minVotesFrac: 0.4,
    convergeDist: 0.15,
    score: [[0, 40], [1, 65], [2, 85], [3, 100]] as Breakpoints,
    convergentBonus: 10,
    confidence: 0.5,
  },

  colorHarmony: {
    sampleStep: 2,
    k: 5,
    iterations: 8,
    /** 忽略 S < 此值的群當色相分析 */
    minClusterSat: 0.15,
    /** 中性像素：S<0.2 且 V 0.2–0.9 */
    neutralSat: 0.2,
    neutralVLo: 0.2,
    neutralVHi: 0.9,
    monoDispersion: 0.15,
    /** 互補/三分容許角度誤差 */
    angleTolerance: 30,
    dispersedScore: [[0.3, 75], [0.6, 50]] as Breakpoints,
    harmonyScore: { mono: 90, complementary: 95, triadic: 90, neutral: 85 },
    satLow: 0.12,
    satHigh: 0.55,
    castWarn: 18,
    castWarnWarm: 24,
    neutralShareConfPenaltyAt: 0.8,
    neutralShareConfPenalty: 0.4,
  },

  sharpness: {
    // TODO: 常數需用 ~20 張真圖＋其模糊版校準（目前為設計值）
    score: [[0.002, 10], [0.01, 45], [0.03, 80], [0.08, 100]] as Breakpoints,
    hintScore: 45,
    hintConf: 0.5,
    confidence: [[15, 0.2], [40, 1]] as Breakpoints,
    eps: 1e-6,
  },

  noise: {
    grid: 8,
    flatFraction: 0.2,
    score: [[1.5, 100], [3, 80], [6, 45], [10, 10]] as Breakpoints,
    hintScore: 50,
    confidence: 0.7,
    minFlatCells: 6,
    lowConfidence: 0.3,
  },

  symmetry: {
    score: [[0.3, 30], [0.6, 70], [0.8, 100]] as Breakpoints,
    hintSym: 0.7,
    confidence: 0.8,
  },

  overall: {
    weights: {
      exposure: 0.2,
      sharpness: 0.2,
      thirds: 0.15,
      colorHarmony: 0.15,
      horizon: 0.1,
      negativeSpace: 0.1,
      leadingLines: 0.05,
      noise: 0.05,
    } as Record<string, number>,
    minConfidence: 0.3,
  },
} as const
