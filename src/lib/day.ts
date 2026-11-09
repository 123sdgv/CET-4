// 学习日：按设备本地时间，凌晨 4 点换天。
export const CUTOFF_HOURS = 4
const DAY_MS = 86400000

const pad = (n: number) => String(n).padStart(2, '0')

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function studyDay(t: Date | number = Date.now()): string {
  const d = new Date(typeof t === 'number' ? t : t.getTime())
  d.setHours(d.getHours() - CUTOFF_HOURS)
  return ymd(d)
}

export function parseDay(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d, 12)
}

export function addDays(s: string, n: number): string {
  const d = parseDay(s)
  d.setDate(d.getDate() + n)
  return ymd(d)
}

/** a - b，单位天 */
export function diffDays(a: string, b: string): number {
  return Math.round((parseDay(a).getTime() - parseDay(b).getTime()) / DAY_MS)
}

export function weekStart(s: string): string {
  const d = parseDay(s)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return ymd(d)
}

export function monthStart(s: string): string {
  return s.slice(0, 8) + '01'
}

export function addMonths(s: string, n: number): string {
  const d = parseDay(monthStart(s))
  d.setMonth(d.getMonth() + n)
  return ymd(d)
}

export function monthEnd(s: string): string {
  return addDays(addMonths(s, 1), -1)
}

/** 下一个学习日开始的时间点（下一个凌晨 4 点） */
export function nextDayStart(now: Date | number = Date.now()): number {
  const d = new Date(typeof now === 'number' ? now : now.getTime())
  const r = new Date(d)
  r.setHours(CUTOFF_HOURS, 0, 0, 0)
  if (r.getTime() <= d.getTime()) r.setDate(r.getDate() + 1)
  return r.getTime()
}
