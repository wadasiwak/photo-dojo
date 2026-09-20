import { describe, expect, it } from 'vitest'
import { crop, hashSeed, inscribedRect, resize, rng, rotateCrop, sobel, toGray, boxBlurGray, rgb2hsv, hsv2rgb } from '../../raster'
import { checker, flat, gradient, randomGray, tiltedLine } from './synth'

const meanGray = (g: Float32Array): number => g.reduce((s, v) => s + v, 0) / g.length

describe('raster', () => {
  it('resize 保平均亮度 ±1 與長寬比', () => {
    const src = gradient(1280, 853, 'h')
    const small = resize(src, 320)
    expect(small.w).toBe(320)
    expect(Math.abs(small.h - 213)).toBeLessThanOrEqual(1)
    expect(Math.abs(meanGray(toGray(small)) - meanGray(toGray(src)))).toBeLessThan(1)
    // 非整數倍（1000 → 480）也保平均
    const mid = resize(gradient(1000, 700, 'v'), 480)
    expect(mid.w).toBe(480)
    expect(Math.abs(meanGray(toGray(mid)) - 127.5)).toBeLessThan(1)
    // 已經夠小就原樣回傳
    const same = flat(100, 50, 10)
    expect(resize(same, 320)).toBe(same)
  })

  it('toGray 純紅 = 76 ±1', () => {
    const g = toGray(flat(4, 4, [255, 0, 0]))
    expect(Math.abs(g[0] - 76)).toBeLessThanOrEqual(1)
  })

  it('sobel 垂直階梯 gx≠0、gy≈0', () => {
    const r = flat(20, 20, 0)
    for (let y = 0; y < 20; y++) for (let x = 10; x < 20; x++) { const o = (y * 20 + x) * 4; r.data[o] = r.data[o + 1] = r.data[o + 2] = 255 }
    const g = toGray(r)
    const { gx, gy, mag } = sobel(g, 20, 20)
    const i = 10 * 20 + 10
    expect(Math.abs(gx[i])).toBeGreaterThan(100)
    expect(Math.abs(gy[i])).toBeLessThan(1e-3)
    expect(mag[i]).toBeCloseTo(Math.abs(gx[i]), 3)
  })

  it('rotateCrop(0) 恒等；rotateCrop(5) 尺寸不變且無黑角', () => {
    const src = tiltedLine(120, 80, 0, 1, [200, 200, 200], [50, 50, 50])
    const same = rotateCrop(src, 0)
    expect(same.w).toBe(120)
    expect(same.h).toBe(80)
    expect(Array.from(same.data)).toEqual(Array.from(src.data))
    const bright = flat(120, 80, 200)
    const rot = rotateCrop(bright, 5)
    expect(rot.w).toBe(120)
    expect(rot.h).toBe(80)
    let min = 255
    for (let i = 0; i < rot.data.length; i += 4) min = Math.min(min, rot.data[i])
    expect(min).toBeGreaterThan(190)
  })

  it('inscribedRect 在界內、同長寬比', () => {
    const rc = inscribedRect(400, 300, 6)
    expect(rc.x).toBeGreaterThanOrEqual(0)
    expect(rc.y).toBeGreaterThanOrEqual(0)
    expect(rc.x + rc.w).toBeLessThanOrEqual(400)
    expect(rc.y + rc.h).toBeLessThanOrEqual(300)
    expect(Math.abs(rc.w / rc.h - 4 / 3)).toBeLessThan(0.02)
    expect(inscribedRect(400, 300, 0)).toEqual({ x: 0, y: 0, w: 400, h: 300 })
  })

  it('crop 取正確像素', () => {
    const c = crop(checker(16, 16, 8), 8, 0, 8, 8)
    expect(c.w).toBe(8)
    expect(c.data[0]).toBe(0)
  })

  it('boxBlurGray 保平均且變平', () => {
    const g = toGray(randomGray(64, 64, 3))
    const b = boxBlurGray(g, 64, 64, 2, 2)
    expect(Math.abs(meanGray(b) - meanGray(g))).toBeLessThan(2)
    const sd = (a: Float32Array) => { const m = meanGray(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length) }
    expect(sd(b)).toBeLessThan(sd(g) / 2)
  })

  it('rgb2hsv / hsv2rgb 互逆', () => {
    const [h, s, v] = rgb2hsv(200, 100, 50)
    expect(h).toBeCloseTo(20, 0)
    const [r, g, b] = hsv2rgb(h, s, v)
    expect(r).toBeCloseTo(200, 3)
    expect(g).toBeCloseTo(100, 3)
    expect(b).toBeCloseTo(50, 3)
  })

  it('rng 可重現且 ∈ [0,1)；hashSeed 穩定', () => {
    const a = rng(42), b = rng(42)
    for (let i = 0; i < 100; i++) {
      const v = a()
      expect(v).toBe(b())
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
    expect(rng(1)()).not.toBe(rng(2)())
    expect(hashSeed('img', 'tilt', 3)).toBe(hashSeed('img', 'tilt', 3))
    expect(hashSeed('img', 'tilt', 3)).not.toBe(hashSeed('img', 'tilt', 4))
  })
})
