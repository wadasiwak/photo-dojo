// 內容彙整層。各章/池為自包含檔，掛載只加一行 import；尚未產出的檔用 try-catch 不了——
// 靜態 import 必須存在，所以這裡的清單 = 目前已到齊的檔（check-content.mjs 驗完備性）。
import { CHAPTERS, CHAPTER_IDS, type ChapterId, type Lesson, type Challenge, type CommonsImage, type ComparisonPair } from './types.ts'
import { compositionLessons } from './lessons/composition.ts'
import { lightLessons } from './lessons/light.ts'
import { exposureLessons } from './lessons/exposure.ts'
import { colorLessons } from './lessons/color.ts'
import { sceneLessons } from './lessons/scenes.ts'
import { CHALLENGES } from './challenges.ts'
import { landscapeArchitecturePool } from './pool/landscape-architecture.ts'
import { peopleStillLifePool } from './pool/people-stilllife.ts'
import { PAIRS } from './pairs.ts'

export { CHAPTERS, CHAPTER_IDS }
export type { ChapterId, Lesson, Challenge, CommonsImage, ComparisonPair }

export const LESSONS_BY_CHAPTER: Record<ChapterId, Lesson[]> = {
  composition: compositionLessons,
  light: lightLessons,
  exposure: exposureLessons,
  color: colorLessons,
  scenes: sceneLessons,
}
export const LESSONS: Lesson[] = CHAPTER_IDS.flatMap((c) => LESSONS_BY_CHAPTER[c])
export const LESSON_BY_ID: ReadonlyMap<string, Lesson> = new Map(LESSONS.map((l) => [l.id, l]))

export { CHALLENGES }
export const CHALLENGE_BY_ID: ReadonlyMap<string, Challenge> = new Map(CHALLENGES.map((c) => [c.id, c]))

export const POOL: CommonsImage[] = [...landscapeArchitecturePool, ...peopleStillLifePool]
export const POOL_BY_ID: ReadonlyMap<string, CommonsImage> = new Map(POOL.map((i) => [i.id, i]))

export { PAIRS }
export const PAIR_BY_ID: ReadonlyMap<string, ComparisonPair> = new Map(PAIRS.map((p: ComparisonPair) => [p.id, p]))
