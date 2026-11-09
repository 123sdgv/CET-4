// 全局状态：设置、当前语言词库、今日计划。
import { allCards, allLogs, kvGet, kvSet } from './db.ts'
import { nextDayStart, studyDay } from './day.ts'
import { planToday, stubborn, type CardRec, type LogRec, type Plan, type Word } from './study.ts'

export interface Settings {
  lang: string
  newPerDay: number
  coreFirst: boolean
  autoSpeak: boolean
  rate: number
  reverse: boolean
}

export const DEFAULT_SETTINGS: Settings = { lang: 'en', newPerDay: 20, coreFirst: true, autoSpeak: true, rate: 0.9, reverse: false }

export interface LangInfo { code: string; name: string; version: string; words: number; phrases: number }
export interface Manifest { generated: string; languages: LangInfo[] }
export interface WordList { lang: string; version: string; words: Word[] }

export const state = {
  settings: { ...DEFAULT_SETTINGS },
  words: [] as Word[],
  wordMap: new Map<string, Word>(),
  version: '',
  manifest: null as Manifest | null,
}

const BASE = import.meta.env.BASE_URL

export async function loadSettings(): Promise<void> {
  state.settings = { ...DEFAULT_SETTINGS, ...(await kvGet<Partial<Settings>>('settings', {})) }
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  state.settings = { ...state.settings, ...patch }
  await kvSet('settings', state.settings)
}

function setList(list: WordList | null) {
  state.words = list?.words ?? []
  state.wordMap = new Map(state.words.map((w) => [w.id, w]))
  state.version = list?.version ?? ''
}

export async function loadCachedWords(): Promise<void> {
  setList(await kvGet<WordList | null>(`words:${state.settings.lang}`, null))
  state.manifest = await kvGet<Manifest | null>('manifest', null)
}

/** 联网检查词库更新。新词只是加入词库，已有卡片的进度完全不动。 */
export async function syncWords(): Promise<{ ok: boolean; updated: boolean; added: number }> {
  const lang = state.settings.lang
  let manifest: Manifest
  try {
    const r = await fetch(`${BASE}data/manifest.json`, { cache: 'no-store' })
    if (!r.ok) throw new Error(String(r.status))
    manifest = await r.json()
  } catch {
    return { ok: false, updated: false, added: 0 }
  }
  state.manifest = manifest
  await kvSet('manifest', manifest)
  const info = manifest.languages.find((l) => l.code === lang)
  if (!info || info.version === state.version) return { ok: true, updated: false, added: 0 }
  try {
    const r = await fetch(`${BASE}data/${lang}.json?v=${info.version}`, { cache: 'no-store' })
    if (!r.ok) throw new Error(String(r.status))
    const list: WordList = await r.json()
    const had = state.words.length > 0
    const old = new Set(state.words.map((w) => w.id))
    const added = list.words.filter((w) => !old.has(w.id)).length
    await kvSet(`words:${lang}`, list)
    if (state.settings.lang === lang) setList(list)
    return { ok: true, updated: true, added: had ? added : 0 }
  } catch {
    return { ok: false, updated: false, added: 0 }
  }
}

export interface Today {
  today: string
  cards: Map<string, CardRec>
  logs: LogRec[]
  todayLogs: LogRec[]
  plan: Plan
  stubborn: Map<string, number>
  doneDays: string[]
}

export async function loadToday(): Promise<Today> {
  const lang = state.settings.lang
  const now = Date.now()
  const today = studyDay(now)
  const [cardList, logs, extra, doneDays] = await Promise.all([
    allCards(lang),
    allLogs(lang),
    kvGet<{ day: string; n: number }>(`extra:${lang}`, { day: '', n: 0 }),
    kvGet<string[]>(`done:${lang}`, []),
  ])
  const cards = new Map(cardList.map((c) => [c.id, c]))
  const todayLogs = logs.filter((l) => l.day === today)
  const plan = planToday({
    words: state.words,
    cards,
    todayLogs,
    today,
    dayEnd: nextDayStart(now),
    newPerDay: state.settings.newPerDay,
    extraNew: extra.day === today ? extra.n : 0,
    coreFirst: state.settings.coreFirst,
  })
  return { today, cards, logs, todayLogs, plan, stubborn: stubborn(logs, today), doneDays }
}

export async function markDone(today: string): Promise<void> {
  const key = `done:${state.settings.lang}`
  const days = await kvGet<string[]>(key, [])
  if (!days.includes(today)) await kvSet(key, [...days, today])
}

export async function addExtraNew(today: string, n: number): Promise<void> {
  const key = `extra:${state.settings.lang}`
  const cur = await kvGet<{ day: string; n: number }>(key, { day: '', n: 0 })
  await kvSet(key, { day: today, n: (cur.day === today ? cur.n : 0) + n })
}
