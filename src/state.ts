import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { CHAPTER_IDS, LESSON_BY_ID, POOL_BY_ID, PAIR_BY_ID, type ChapterId } from './content/index.ts'
import type { PrincipleId } from './content/principles.ts'
import type { VisionModel } from './content/types.ts'
import { recordAnswer, type SrsState } from './lib/srs.ts'
import { isDateStr } from './lib/seed.ts'

/** API key 獨立存放，絕不進備份檔 */
export const API_KEY_STORAGE = 'photo-dojo-apikey-v1'

export type View =
  | { name: 'home' }
  | { name: 'learn'; chapter?: ChapterId; lessonId?: string }
  | { name: 'score' }
  | { name: 'quiz'; mode?: 'variant' | 'pair'; itemId?: string }
  | { name: 'daily'; date?: string }
  | { name: 'gallery'; entryId?: string }
  | { name: 'stats' }
  | { name: 'settings' }

export interface AiCritique {
  overall: number
  subject: string
  mood: string
  strengths: string[]
  improvements: Array<{ principle: PrincipleId; text: string }>
  nextShot: string
  model: string
}

/** 作品集一筆：照片 blob 在 IndexedDB（photoId），這裡存文字與分數 */
export interface GalleryEntry {
  id: string
  photoId: string
  /** 縮圖 dataURL（≤240px，作品牆用，不用開 IndexedDB） */
  thumb: string
  createdAt: string
  /** 若為每日任務交件 */
  challengeId?: string
  date?: string
  localScore?: number
  localHints?: Array<{ principle: PrincipleId; text: string }>
  ai?: AiCritique
  note?: string
}

export interface QuizLog {
  total: number
  correct: number
  streak: number
  bestStreak: number
}

interface AppState {
  view: View
  go: (v: View) => void
  // 教學
  lessonsDone: Record<string, string> // lessonId → ISO 日期
  checklist: Record<string, boolean[]>
  markLesson: (id: string, done: boolean) => void
  toggleCheck: (id: string, i: number, n: number) => void
  // 測驗
  srs: SrsState
  quiz: QuizLog
  answerQuiz: (principles: PrincipleId[], correct: boolean) => void
  quizDifficulty: 'hard' | 'medium' | 'easy'
  setQuizDifficulty: (d: 'hard' | 'medium' | 'easy') => void
  // 作品
  gallery: GalleryEntry[]
  addEntry: (e: GalleryEntry) => void
  updateEntry: (id: string, patch: Partial<GalleryEntry>) => void
  removeEntry: (id: string) => void
  // 設定
  visionModel: VisionModel
  setVisionModel: (m: VisionModel) => void
  // 匯入
  importState: (data: Partial<Pick<AppState, 'lessonsDone' | 'checklist' | 'srs' | 'quiz' | 'gallery'>>) => void
  resetAll: () => void
}

export function viewToHash(v: View): string {
  switch (v.name) {
    case 'home': return ''
    case 'learn': return v.lessonId ? `#learn/${v.lessonId}` : v.chapter ? `#learn/${v.chapter}` : '#learn'
    case 'score': return '#score'
    case 'quiz': return v.mode ? (v.itemId ? `#quiz/${v.mode}/${v.itemId}` : `#quiz/${v.mode}`) : '#quiz'
    case 'daily': return v.date ? `#daily/${v.date}` : '#daily'
    case 'gallery': return v.entryId ? `#gallery/${v.entryId}` : '#gallery'
    case 'stats': return '#stats'
    case 'settings': return '#settings'
  }
}

// 還原參數嚴格驗證：不合法一律回上一層或 home
export function hashToView(hash: string): View {
  const parts = hash.replace(/^#/, '').split('/')
  switch (parts[0]) {
    case 'learn': {
      const p = parts[1]
      if (!p) return { name: 'learn' }
      if ((CHAPTER_IDS as readonly string[]).includes(p)) return { name: 'learn', chapter: p as ChapterId }
      const l = LESSON_BY_ID.get(p)
      if (l) return { name: 'learn', chapter: l.chapter, lessonId: p }
      return { name: 'learn' }
    }
    case 'score': return { name: 'score' }
    case 'quiz': {
      const m = parts[1]
      if (m !== 'variant' && m !== 'pair') return { name: 'quiz' }
      const id = parts[2]
      if (!id) return { name: 'quiz', mode: m }
      if (m === 'pair' && PAIR_BY_ID.has(id)) return { name: 'quiz', mode: m, itemId: id }
      // variant item id = imgId:flaw:seed
      if (m === 'variant' && /^img-[a-z-]+-\d{3}:[a-zA-Z]+:\d{1,9}$/.test(id) && POOL_BY_ID.has(id.split(':')[0]))
        return { name: 'quiz', mode: m, itemId: id }
      return { name: 'quiz', mode: m }
    }
    case 'daily': {
      const d = parts[1]
      if (d && isDateStr(d)) return { name: 'daily', date: d }
      return { name: 'daily' }
    }
    case 'gallery': {
      const id = parts[1]
      if (id && /^[a-zA-Z0-9-]{4,40}$/.test(id)) return { name: 'gallery', entryId: id }
      return { name: 'gallery' }
    }
    case 'stats': return { name: 'stats' }
    case 'settings': return { name: 'settings' }
    default: return { name: 'home' }
  }
}

const EMPTY_QUIZ: QuizLog = { total: 0, correct: 0, streak: 0, bestStreak: 0 }

export const useApp = create<AppState>()(
  persist(
    (set) => ({
      view: hashToView(location.hash),
      go: (view) => {
        history.replaceState(null, '', viewToHash(view) || location.pathname)
        window.scrollTo(0, 0)
        set({ view })
      },
      lessonsDone: {},
      checklist: {},
      markLesson: (id, done) =>
        set((s) => {
          const next = { ...s.lessonsDone }
          if (done) next[id] = new Date().toISOString()
          else delete next[id]
          return { lessonsDone: next }
        }),
      toggleCheck: (id, i, n) =>
        set((s) => {
          const arr = [...(s.checklist[id] ?? Array.from({ length: n }, () => false))]
          arr[i] = !arr[i]
          return { checklist: { ...s.checklist, [id]: arr } }
        }),
      srs: {},
      quiz: EMPTY_QUIZ,
      quizDifficulty: 'medium',
      setQuizDifficulty: (d) => set({ quizDifficulty: d }),
      answerQuiz: (principles, correct) =>
        set((s) => {
          const streak = correct ? s.quiz.streak + 1 : 0
          return {
            srs: recordAnswer(s.srs, principles, correct),
            quiz: {
              total: s.quiz.total + 1,
              correct: s.quiz.correct + (correct ? 1 : 0),
              streak,
              bestStreak: Math.max(s.quiz.bestStreak, streak),
            },
          }
        }),
      gallery: [],
      addEntry: (e) => set((s) => ({ gallery: [e, ...s.gallery] })),
      updateEntry: (id, patch) => set((s) => ({ gallery: s.gallery.map((g) => (g.id === id ? { ...g, ...patch } : g)) })),
      removeEntry: (id) => set((s) => ({ gallery: s.gallery.filter((g) => g.id !== id) })),
      visionModel: 'precise',
      setVisionModel: (m) => set({ visionModel: m }),
      importState: (data) =>
        set((s) => ({
          lessonsDone: data.lessonsDone ?? s.lessonsDone,
          checklist: data.checklist ?? s.checklist,
          srs: data.srs ?? s.srs,
          quiz: data.quiz ?? s.quiz,
          gallery: data.gallery ?? s.gallery,
        })),
      resetAll: () => set({ lessonsDone: {}, checklist: {}, srs: {}, quiz: EMPTY_QUIZ, gallery: [] }),
    }),
    {
      name: 'photo-dojo-progress-v1',
      partialize: (s) => ({
        lessonsDone: s.lessonsDone,
        checklist: s.checklist,
        srs: s.srs,
        quiz: s.quiz,
        quizDifficulty: s.quizDifficulty,
        gallery: s.gallery,
        visionModel: s.visionModel,
      }),
    },
  ),
)

window.addEventListener('hashchange', () => {
  useApp.setState({ view: hashToView(location.hash) })
})
