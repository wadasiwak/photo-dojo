/** RGBA 像素陣列；所有引擎運算都在這個純資料結構上，不碰 canvas（vitest node 可測）。 */
export interface Raster {
  w: number
  h: number
  /** RGBA, length = w*h*4 */
  data: Uint8ClampedArray
}
