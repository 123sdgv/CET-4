// 每日学习计划、过关规则、连续天数、顽固词：纯函数，便于测试。
import { addDays, studyDay } from './day.ts'

export type Grade = 1 | 2 | 3 // 1 不认识 Again，2 眼熟 Hard，3 认识 Good

export interface Source { sid: string; origin: string; ctx: string }

export interface Word {
  id: string
  type: '单词' | '短语'
  front: string
  meaning: string
  pos: string
  usage: string
  exEn: string
  exZh: string
  priority: '核心' | '拓展'
  sources: Source[]
}

export interface CardRec {
  key: string // `${lang}:${id}`
  lang: string
  id: string
  due: number // 下次到期（毫秒）
  last: number | null // 上次复习（毫秒）
  firstDay: string // 第一次学的学习日
  fsrs: unknown // ts-fsrs 的卡片状态
}

export type CardSnapshot = Pick<CardRec, 'due' | 'last' | 'firstDay' | 'fsrs'>

export interface LogRec {
  n?: number
  lang: string
  id: string
  g: Grade
  day: string
  ts: number
  ms: number // 这张卡思考用时（最多 60 秒）
  prev: CardSnapshot | null // 评分前的状态，用于撤回
}

export type TodayState = 'none' | 'pass' | 'pending'

/** 不认识：要一直回来直到点「认识」；眼熟：再回来一次。 */
export function todayState(grades: Grade[]): TodayState {
  if (!grades.length) return 'none'
  let s: 'start' | 'hard1' | 'needGood' | 'pass' = 'start'
  for (const g of grades) {
    if (g === 1) s = 'needGood'
    else if (g === 3) s = 'pass'
    else s = s === 'needGood' ? 'needGood' : s === 'hard1' ? 'pass' : 'hard1'
  }
  return s === 'pass' ? 'pass' : 'pending'
}

export const GAP: Record<Grade, number> = { 1: 3, 2: 6, 3: 0 }

/** 评分后更新本轮队列：没过关的卡隔几张再出现。 */
export function afterGrade(queue: string[], id: string, g: Grade, state: TodayState): string[] {
  const q = queue.filter((x) => x !== id)
  if (state === 'pending') q.splice(Math.min(GAP[g] || GAP[1], q.length), 0, id)
  return q
}

export function gradesById(logs: LogRec[]): Map<string, { grades: Grade[]; ts: number }> {
  const m = new Map<string, { grades: Grade[]; ts: number }>()
  for (const l of [...logs].sort((a, b) => a.ts - b.ts)) {
    const e = m.get(l.id) ?? { grades: [], ts: 0 }
    e.grades.push(l.g)
    e.ts = l.ts
    m.set(l.id, e)
  }
  return m
}

export interface PlanInput {
  words: Word[]
  cards: Map<string, CardRec>
  todayLogs: LogRec[]
  today: string
  dayEnd: number
  newPerDay: number
  extraNew: number
  coreFirst: boolean
}

export interface Plan {
  queue: string[]
  pending: string[]
  dueLeft: number
  newLeft: number
  passed: string[]
  newIntroduced: number
  freshLeft: number // 词库里还没学过的词
  done: boolean
}

export function planToday(p: PlanInput): Plan {
  const wordMap = new Map(p.words.map((w) => [w.id, w]))
  const core = (id: string) => (p.coreFirst && wordMap.get(id)?.priority === '核心' ? 1 : 0)
  const byId = gradesById(p.todayLogs)
  const pendingList: { id: string; ts: number }[] = []
  const passed: string[] = []
  for (const [id, e] of byId) {
    const st = todayState(e.grades)
    if (st === 'pass') passed.push(id)
    else if (wordMap.has(id)) pendingList.push({ id, ts: e.ts })
  }
  pendingList.sort((a, b) => a.ts - b.ts)
  const pending = pendingList.map((x) => x.id)
  const due = [...p.cards.values()]
    .filter((c) => wordMap.has(c.id) && !byId.has(c.id) && c.due < p.dayEnd)
    .sort((a, b) => core(b.id) - core(a.id) || a.due - b.due)
    .map((c) => c.id)
  let newIntroduced = 0
  for (const c of p.cards.values()) if (c.firstDay === p.today) newIntroduced++
  const quota = Math.max(0, p.newPerDay + p.extraNew - newIntroduced)
  const fresh = p.words.filter((w) => !p.cards.has(w.id))
  const ordered = p.coreFirst ? [...fresh.filter((w) => core(w.id)), ...fresh.filter((w) => !core(w.id))] : fresh
  const newIds = ordered.slice(0, quota).map((w) => w.id)
  const pendingNew = pending.filter((id) => p.cards.get(id)?.firstDay === p.today).length
  const queue = [...pending, ...due, ...newIds]
  return {
    queue,
    pending,
    dueLeft: due.length + pending.length - pendingNew,
    newLeft: newIds.length + pendingNew,
    passed,
    newIntroduced,
    freshLeft: fresh.length,
    done: queue.length === 0,
  }
}

/** 连续完成天数：今天还没完成不算断。 */
export function streak(doneDays: Iterable<string>, today: string): number {
  const set = new Set(doneDays)
  let d = set.has(today) ? today : addDays(today, -1)
  let n = 0
  while (set.has(d)) {
    n++
    d = addDays(d, -1)
  }
  return n
}

/** 顽固词：最近 30 天至少点了 3 次「不认识」。返回 id → 次数 */
export function stubborn(logs: LogRec[], today: string, min = 3, window = 30): Map<string, number> {
  const from = addDays(today, -(window - 1))
  const count = new Map<string, number>()
  for (const l of logs) if (l.g === 1 && l.day >= from && l.day <= today) count.set(l.id, (count.get(l.id) ?? 0) + 1)
  for (const [id, n] of count) if (n < min) count.delete(id)
  return count
}

export const MASTER_DAYS = 21

export function isMastered(c: CardRec): boolean {
  return c.last != null && c.due - c.last >= MASTER_DAYS * 86400000
}

/** 每个学习日还要复习多少张（预测，灰柱用）。今天还包括没背完的新词。 */
export function forecastByDay(cards: CardRec[], plan: Plan, wordIds: Set<string>, today: string): Map<string, number> {
  const m = new Map<string, number>()
  const add = (d: string, n = 1) => m.set(d, (m.get(d) ?? 0) + n)
  const pending = new Set(plan.pending)
  const passed = new Set(plan.passed)
  for (const c of cards) {
    if (!wordIds.has(c.id)) continue
    if (pending.has(c.id)) { add(today); continue }
    let d = studyDay(c.due)
    if (d < today) d = today
    if (d === today && passed.has(c.id)) d = addDays(today, 1)
    add(d)
  }
  const fresh = plan.newLeft - plan.pending.filter((id) => cards.find((c) => c.id === id)?.firstDay === today).length
  if (fresh > 0) add(today, fresh)
  return m
}
