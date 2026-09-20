// 作品照片庫（IndexedDB）。localStorage 放不下照片：文字紀錄存 zustand persist，blob 存這裡。
const DB_NAME = 'photo-dojo-photos'
const STORE = 'photos'
let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}
function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const req = fn(t.objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}
let persistRequested = false
export async function savePhoto(blob: Blob, id: string = crypto.randomUUID()): Promise<string> {
  if (!persistRequested) {
    persistRequested = true
    void navigator.storage?.persist?.().catch(() => {})
  }
  await tx('readwrite', (s) => s.put(blob, id))
  return id
}
export async function getPhoto(id: string): Promise<Blob | null> {
  const r = await tx<Blob | undefined>('readonly', (s) => s.get(id))
  return r ?? null
}
export async function deletePhoto(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id))
}
export async function clearAllPhotos(): Promise<void> {
  await tx('readwrite', (s) => s.clear())
}
export async function allPhotos(): Promise<Array<{ id: string; blob: Blob }>> {
  const keys = await tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys())
  const out: Array<{ id: string; blob: Blob }> = []
  for (const k of keys) {
    const b = await getPhoto(String(k))
    if (b) out.push({ id: String(k), blob: b })
  }
  return out
}
export const blobToDataUrl = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(String(r.result))
    r.onerror = () => rej(r.error)
    r.readAsDataURL(b)
  })
export async function dataUrlToBlob(u: string): Promise<Blob> {
  return (await fetch(u)).blob()
}
