// 统计页的日 / 周 / 月分组。
import { addDays, addMonths, monthEnd, monthStart, weekStart } from './day.ts'
import type { LogRec } from './study.ts'

export type View = 'day' | 'week' | 'month'

export interface Bucket {
  label: string
  start: string
  end: string
  rel: -1 | 0 | 1 // 过去 / 当前 / 将来
  again: number
  hard: number
  good: number
  ms: number
  forecast: number
}

const DAY_LABELS = ['5天前', '4天前', '3天前', '前天', '昨天', '今天', '明天', '后天', '3天后', '4天后']
const WEEK_LABELS = ['5周前', '4周前', '3周前', '2周前', '1周前', '本周', '1周后', '2周后', '3周后', '4周后']

export const PAST = 5
export const FUTURE = 4

export function makeBuckets(view: View, today: string): Bucket[] {
  const out: Bucket[] = []
  for (let i = -PAST; i <= FUTURE; i++) {
    let start: string
    let end: string
    let label: string
    if (view === 'day') {
      start = end = addDays(today, i)
      label = DAY_LABELS[i + PAST]
    } else if (view === 'week') {
      start = addDays(weekStart(today), i * 7)
      end = addDays(start, 6)
      label = WEEK_LABELS[i + PAST]
    } else {
      start = addMonths(monthStart(today), i)
      end = monthEnd(start)
      label = i === 0 ? '本月' : `${Number(start.slice(5, 7))}月`
    }
    out.push({ label, start, end, rel: i < 0 ? -1 : i > 0 ? 1 : 0, again: 0, hard: 0, good: 0, ms: 0, forecast: 0 })
  }
  return out
}

export function fillBuckets(buckets: Bucket[], logs: LogRec[], forecast: Map<string, number>, today: string): Bucket[] {
  for (const l of logs) {
    const b = buckets.find((x) => x.rel <= 0 && l.day >= x.start && l.day <= x.end)
    if (!b) continue
    if (l.g === 1) b.again++
    else if (l.g === 2) b.hard++
    else b.good++
    b.ms += l.ms || 0
  }
  for (const [day, n] of forecast) {
    if (day < today) continue
    const b = buckets.find((x) => x.rel >= 0 && day >= x.start && day <= x.end)
    if (b) b.forecast += n
  }
  return buckets
}

export function total(b: Bucket): number {
  return b.again + b.hard + b.good
}

/** 坐标轴：最多 4 段，每段是 1/2/5×10^k */
export function niceMax(n: number): { max: number; step: number } {
  const raw = Math.max(1, n) / 4
  const pow = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * pow).find((x) => x >= raw)!)
  return { max: Math.ceil(Math.max(1, n) / step) * step, step }
}

export function formatDuration(ms: number): string {
  const min = Math.round(ms / 60000)
  if (min < 60) return `${min} 分钟`
  return `${Math.floor(min / 60)} 小时 ${min % 60} 分`
}
