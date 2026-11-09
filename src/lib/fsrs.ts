// ts-fsrs v6（默认 FSRS-7）封装。不认识 / 眼熟 / 认识 → Again / Hard / Good。
import { DefaultScheduler, Rating } from 'ts-fsrs'
import type { CardRec, Grade } from './study.ts'

type Scheduler = Awaited<ReturnType<typeof DefaultScheduler>>

const cache = new Map<number, Promise<Scheduler>>()

function scheduler(retention: number): Promise<Scheduler> {
  let s = cache.get(retention)
  if (!s) {
    // 本轮内重复出现由界面控制，所以不再用分钟级学习步骤，间隔全部交给 FSRS。
    const cfg = { desiredRetention: retention, enableShortTerm: true, learningSteps: [], relearningSteps: [], enableFuzz: true, maximumInterval: 36500 }
    s = DefaultScheduler(cfg as never).catch(() => DefaultScheduler({ desiredRetention: retention } as never))
    cache.set(retention, s)
  }
  return s
}

const RATING = { 1: Rating.Again, 2: Rating.Hard, 3: Rating.Good } as const

function toMs(v: unknown): number | null {
  if (v instanceof Date) return v.getTime()
  if (typeof v === 'number') return v
  if (typeof v === 'string') { const t = Date.parse(v); return Number.isNaN(t) ? null : t }
  return null
}

export const NORMAL_RETENTION = 0.9
export const STUBBORN_RETENTION = 0.95 // 顽固词要求更高，复习更频繁

export async function review(prev: CardRec | null, lang: string, id: string, g: Grade, now: Date, today: string, isStubborn: boolean): Promise<CardRec> {
  const s = await scheduler(isStubborn ? STUBBORN_RETENTION : NORMAL_RETENTION)
  const key = `${lang}:${id}`
  const card = prev ? prev.fsrs : s.newCard({ now, cardId: key })
  const res = s.review({ card: card as never, grade: RATING[g] as never, now })
  const next = res.card as unknown as Record<string, unknown>
  const due = toMs(next.dueAt ?? next.due) ?? now.getTime() + 86400000
  const last = toMs(next.lastReviewAt ?? next.last_review) ?? now.getTime()
  return { key, lang, id, due, last, firstDay: prev?.firstDay ?? today, fsrs: { ...next } }
}
