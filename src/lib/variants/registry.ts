// 8 壞法註冊表：原則、來源標籤資格、三難度參數。門檻全是資料，調參改這裡。
import type { PrincipleId } from '../../content/principles'
import type { SourceTag } from '../../content/types'
import type { Difficulty, FlawId } from './types'

export interface FlawMeta {
  principle: PrincipleId
  /** 短中文標籤（UI 顯示、debug） */
  label: string
  /** 非空時，源圖 tags 需至少含其一 */
  requires: readonly SourceTag[]
  /** 源圖 tags 含任一即排除 */
  excludes: readonly SourceTag[]
  /** 各難度參數（單位見各 flaw 檔註解） */
  tiers: Record<Difficulty, Readonly<Record<string, number>>>
}

export const FLAWS: Record<FlawId, FlawMeta> = {
  tilt: {
    principle: 'horizon-level',
    label: '歪斜',
    requires: ['horizon', 'architecture'],
    excludes: ['portrait', 'food'],
    // 旋轉角度區間（度）
    tiers: { hard: { min: 3, max: 4.5 }, medium: { min: 4.5, max: 6.5 }, easy: { min: 6.5, max: 9 } },
  },
  overexpose: {
    principle: 'exposure',
    label: '過曝',
    requires: [],
    excludes: ['highkey', 'night'],
    // LUT 255·(in/255)^gamma + offset
    tiers: { hard: { gamma: 0.75, offset: 15 }, medium: { gamma: 0.65, offset: 25 }, easy: { gamma: 0.55, offset: 35 } },
  },
  underexpose: {
    principle: 'exposure',
    label: '過暗',
    requires: [],
    excludes: ['lowkey', 'night'],
    tiers: { hard: { gamma: 1.5, offset: -20 }, medium: { gamma: 1.75, offset: -30 }, easy: { gamma: 2.0, offset: -40 } },
  },
  cropSubject: {
    principle: 'subject-placement',
    label: '主體貼邊',
    requires: [],
    excludes: ['busy', 'symmetric'],
    // window 視窗比例區間；edgeDist 目標（hard/medium）；cut 切掉 bbox 比例區間（easy）
    tiers: {
      hard: { windowMin: 0.7, windowMax: 0.8, edgeDist: 0.08 },
      medium: { windowMin: 0.7, windowMax: 0.8, edgeDist: 0.03 },
      easy: { windowMin: 0.7, windowMax: 0.8, cutMin: 0.25, cutMax: 0.45 },
    },
  },
  centerCrop: {
    principle: 'rule-of-thirds',
    label: '主體置中',
    requires: [],
    excludes: ['busy', 'symmetric', 'centered'],
    // window 視窗比例
    tiers: { hard: { window: 0.85 }, medium: { window: 0.8 }, easy: { window: 0.7 } },
  },
  desaturate: {
    principle: 'saturation',
    label: '褪色',
    requires: [],
    excludes: ['bw'],
    // k 飽和度倍率；lift 亮度提升（0–255）
    // easy 取 0.03（非設計稿 0.05）：保亮度混色下 S 收縮比 k 略大，0.03 才能讓純色也壓到 S<0.05
    tiers: { hard: { k: 0.45, lift: 8 }, medium: { k: 0.3, lift: 8 }, easy: { k: 0.03, lift: 8 } },
  },
  colorCast: {
    principle: 'white-balance',
    label: '色偏',
    requires: [],
    excludes: ['bw', 'night'],
    // magnitude 通道偏移量（0–255）
    tiers: { hard: { magnitude: 18 }, medium: { magnitude: 26 }, easy: { magnitude: 35 } },
  },
  blur: {
    principle: 'sharpness',
    label: '模糊',
    requires: [],
    excludes: [],
    // radius 盒狀模糊半徑（以長邊 800px 為基準）
    tiers: { hard: { radius: 1.5 }, medium: { radius: 2.5 }, easy: { radius: 4 } },
  },
  noise: {
    principle: 'noise',
    label: '雜訊',
    requires: [],
    excludes: ['busy', 'night'],
    // sigma 亮度雜訊 σ；chroma 色度雜訊比例
    tiers: { hard: { sigma: 10, chroma: 0.3 }, medium: { sigma: 18, chroma: 0.3 }, easy: { sigma: 28, chroma: 0.3 } },
  },
}

/** 反卡通守門帶：套用後量測 delta 的容許範圍 */
export const GUARD_BANDS = {
  /** 量到的傾角與設定值容差（度） */
  tiltTolerance: 1,
  /** 曝光裁切百分點增量 */
  clipDelta: { min: 5, max: 45 },
  /** 清晰度分數掉幅 */
  sharpnessDrop: { min: 25, max: 70 },
  /** 超帶時參數倍率 */
  retryScale: 0.75,
} as const
