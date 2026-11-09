// IndexedDB：cards（卡片状态）、logs（每次评分）、kv（设置等）。
import type { CardRec, LogRec } from './study.ts'

const NAME = 'cet-vocab'
const VERSION = 1
let opening: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (!opening) {
    opening = new Promise((resolve, reject) => {
      const r = indexedDB.open(NAME, VERSION)
      r.onupgradeneeded = () => {
        const d = r.result
        d.createObjectStore('cards', { keyPath: 'key' }).createIndex('lang', 'lang')
        d.createObjectStore('logs', { keyPath: 'n', autoIncrement: true }).createIndex('lang', 'lang')
        d.createObjectStore('kv', { keyPath: 'k' })
      }
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error)
    })
  }
  return opening
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

function finish(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('写入被中断'))
  })
}

async function write(stores: string[]): Promise<IDBTransaction> {
  const d = await open()
  return d.transaction(stores, 'readwrite', { durability: 'strict' } as IDBTransactionOptions)
}

export async function allCards(lang?: string): Promise<CardRec[]> {
  const s = (await open()).transaction('cards').objectStore('cards')
  return req(lang ? s.index('lang').getAll(lang) : s.getAll())
}

export async function allLogs(lang?: string): Promise<LogRec[]> {
  const s = (await open()).transaction('logs').objectStore('logs')
  return req(lang ? s.index('lang').getAll(lang) : s.getAll())
}

export async function kvGet<T>(k: string, fallback: T): Promise<T> {
  const row = await req((await open()).transaction('kv').objectStore('kv').get(k))
  return row ? (row.v as T) : fallback
}

export async function kvAll(): Promise<{ k: string; v: unknown }[]> {
  return req((await open()).transaction('kv').objectStore('kv').getAll())
}

export async function kvSet(k: string, v: unknown): Promise<void> {
  const tx = await write(['kv'])
  tx.objectStore('kv').put({ k, v })
  return finish(tx)
}

/** 一次评分：卡片状态和复习记录在同一个事务里写入，要么都成功要么都不写。 */
export async function saveReview(card: CardRec, log: LogRec): Promise<number> {
  const tx = await write(['cards', 'logs'])
  tx.objectStore('cards').put(card)
  const r = tx.objectStore('logs').add(log)
  await finish(tx)
  return r.result as number
}

export async function undoReview(log: LogRec): Promise<void> {
  const tx = await write(['cards', 'logs'])
  const key = `${log.lang}:${log.id}`
  if (log.prev) tx.objectStore('cards').put({ key, lang: log.lang, id: log.id, ...log.prev })
  else tx.objectStore('cards').delete(key)
  if (log.n != null) tx.objectStore('logs').delete(log.n)
  return finish(tx)
}

/** 从备份恢复：清空学习数据后写入。词库缓存保留。 */
export async function replaceAll(cards: CardRec[], logs: LogRec[], kv: { k: string; v: unknown }[]): Promise<void> {
  const keep = (k: string) => k.startsWith('words:') || k === 'manifest'
  const keys = (await kvAll()).map((r) => r.k)
  const tx = await write(['cards', 'logs', 'kv'])
  const cs = tx.objectStore('cards')
  const ls = tx.objectStore('logs')
  const ks = tx.objectStore('kv')
  cs.clear()
  ls.clear()
  for (const k of keys) if (!keep(k)) ks.delete(k)
  for (const c of cards) cs.put(c)
  for (const l of logs) ls.put(l)
  for (const row of kv) if (!keep(row.k)) ks.put(row)
  return finish(tx)
}
