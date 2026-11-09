import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseCsv } from '../scripts/csv.mjs'
import { readCsvText, mergeEntries, makeId, HEADER } from '../scripts/merge-vocab.mjs'
import { studyDay, addDays, weekStart, nextDayStart } from '../src/lib/day.ts'
import { todayState, afterGrade, planToday, streak, stubborn, isMastered, forecastByDay, type CardRec, type LogRec, type Word } from '../src/lib/study.ts'
import { makeBuckets, fillBuckets, total } from '../src/lib/stats.ts'
import { encodeBackup, decodeBackup } from '../src/lib/codec.ts'

const CSV = 'vocab/en/CET4-2025-06-S1-A-BrainPlasticity.csv'
const head = HEADER.join(',')

test('CSV：引号、逗号、换行、BOM、CRLF', () => {
  const rows = parseCsv('﻿a,b\r\n"x, y","he said ""hi""\nok"\r\n')
  assert.deepEqual(rows.map((r) => r.fields), [['a', 'b'], ['x, y', 'he said "hi"\nok']])
  assert.throws(() => parseCsv('a,"b\n'), /引号没有闭合/)
})

test('真题词库：100 张，67 单词 33 短语，ID 全部正确', () => {
  const { entries, errors } = readCsvText(readFileSync(CSV, 'utf8'), CSV)
  assert.deepEqual(errors, [])
  const words = mergeEntries([{ file: CSV, entries }])
  assert.equal(words.length, 100)
  assert.equal(words.filter((w) => w.type === '单词').length, 67)
  assert.equal(words.filter((w) => w.type === '短语').length, 33)
  assert.ok(words.some((w) => w.front === 'be responsible for' && w.type === '短语'))
  assert.equal(makeId('单词', ' Intact '), 'w_eab9dd6e951f')
})

test('坏行会报出行号，不会悄悄丢掉', () => {
  const text = `${head}\n,单词,ok,好,adj.,,,,,核心,文章,X\n,名词,bad,坏,n.,,,,,核心,文章,X\n,单词,few,少\n`
  const { errors } = readCsvText(text, 't.csv')
  assert.ok(errors.some((e) => e.includes('第 3 行') && e.includes('type')))
  assert.ok(errors.some((e) => e.includes('第 4 行') && e.includes('12 列')))
  assert.ok(readCsvText(`${head}\n,单词,two,"二,,,,,,,拓展,文章,X\n`, 't.csv').errors[0].includes('第 2 行'))
  const wrongId = readCsvText(`${head}\nw_000000000000,单词,ok,好,,,,,,核心,文章,X\n`, 't.csv')
  assert.ok(wrongId.errors[0].includes('id 应为'))
})

test('重复上传同一 CSV 不会多出卡片；后上传的释义为准，来源全部保留', () => {
  const a = readCsvText(`${head}\n,单词,adapt,适应,v.,,ctx A,,,拓展,文章,S1\n`, 'a.csv').entries
  const b = readCsvText(`${head}\n,单词,adapt,适应；改编,v.,,ctx B,,,核心,文章,S2\n`, 'b.csv').entries
  const words = mergeEntries([{ file: 'a', entries: a }, { file: 'a2', entries: a }, { file: 'b', entries: b }])
  assert.equal(words.length, 1)
  assert.equal(words[0].meaning, '适应；改编')
  assert.equal(words[0].priority, '核心')
  assert.deepEqual(words[0].sources.map((s) => s.ctx), ['ctx A', 'ctx B'])
})

test('凌晨 4 点换天', () => {
  assert.equal(studyDay(new Date(2026, 10, 10, 3, 59)), '2026-11-09')
  assert.equal(studyDay(new Date(2026, 10, 10, 4, 0)), '2026-11-10')
  assert.equal(weekStart('2026-11-09'), '2026-11-09')
  assert.equal(weekStart('2026-11-15'), '2026-11-09')
  assert.equal(new Date(nextDayStart(new Date(2026, 10, 9, 23, 0))).getDate(), 10)
})

test('过关规则：不认识要到认识为止，眼熟再回来一次', () => {
  assert.equal(todayState([3]), 'pass')
  assert.equal(todayState([1]), 'pending')
  assert.equal(todayState([1, 2]), 'pending')
  assert.equal(todayState([1, 2, 3]), 'pass')
  assert.equal(todayState([2]), 'pending')
  assert.equal(todayState([2, 2]), 'pass')
  assert.deepEqual(afterGrade(['a', 'b', 'c', 'd', 'e'], 'a', 1, 'pending'), ['b', 'c', 'd', 'a', 'e'])
  assert.deepEqual(afterGrade(['a', 'b'], 'a', 2, 'pending'), ['b', 'a'])
  assert.deepEqual(afterGrade(['a', 'b'], 'a', 3, 'pass'), ['b'])
})

const W = (id: string, priority: Word['priority'] = '拓展'): Word => ({ id, type: '单词', front: id, meaning: id, pos: '', usage: '', exEn: '', exZh: '', priority, sources: [] })
const today = '2026-11-09'
const dayEnd = new Date(2026, 10, 10, 4).getTime()
const card = (id: string, due: number, firstDay = '2026-11-01', last: number | null = due - 3 * 86400000): CardRec => ({ key: `en:${id}`, lang: 'en', id, due, last, firstDay, fsrs: {} })
const log = (id: string, g: 1 | 2 | 3, ts: number, day = today): LogRec => ({ lang: 'en', id, g, day, ts, ms: 1000, prev: null })

test('每日计划：先没过关的、再到期复习、再新词；核心优先；新词数量限制不影响复习', () => {
  const words = [W('n1'), W('n2'), W('core', '核心'), W('r1'), W('r2'), W('p1')]
  const cards = new Map([
    ['r1', card('r1', dayEnd - 1000)],
    ['r2', card('r2', dayEnd + 86400000)],
    ['p1', card('p1', dayEnd - 5000, today)],
  ])
  const plan = planToday({ words, cards, todayLogs: [log('p1', 1, 1)], today, dayEnd, newPerDay: 2, extraNew: 0, coreFirst: true })
  assert.deepEqual(plan.queue, ['p1', 'r1', 'core'])
  assert.equal(plan.newLeft, 2) // p1 是今天的新词且没过关 + core
  assert.equal(plan.dueLeft, 1)
  const zero = planToday({ words, cards, todayLogs: [], today, dayEnd, newPerDay: 0, extraNew: 0, coreFirst: true })
  assert.deepEqual(zero.queue, ['p1', 'r1'])
})

test('连续评分 3 次后重新计算（相当于刷新）仍然保留进度', () => {
  const words = [W('a'), W('b'), W('c')]
  const cards = new Map(['a', 'b', 'c'].map((id) => [id, card(id, dayEnd + 5 * 86400000, today)]))
  const logs = [log('a', 3, 1), log('b', 3, 2), log('c', 3, 3)]
  const plan = planToday({ words, cards, todayLogs: logs, today, dayEnd, newPerDay: 3, extraNew: 0, coreFirst: false })
  assert.equal(plan.done, true)
  assert.equal(plan.passed.length, 3)
})

test('连续天数跨日计算；没背的日子统计留白', () => {
  assert.equal(streak(['2026-11-07', '2026-11-08'], today), 2)
  assert.equal(streak(['2026-11-07', '2026-11-08', today], today), 3)
  assert.equal(streak(['2026-11-06', '2026-11-08'], today), 1)
  const logs = [log('a', 3, 1, '2026-11-07'), log('a', 1, 2, today)]
  const bs = fillBuckets(makeBuckets('day', today), logs, new Map(), today)
  assert.equal(bs.map(total).join(','), '0,0,0,1,0,1,0,0,0,0')
  assert.equal(total(bs[4]), 0) // 昨天没背：空白
})

test('顽固词：30 天内 3 次不认识；已掌握：间隔 ≥ 21 天', () => {
  const logs = [log('x', 1, 1, '2026-11-01'), log('x', 1, 2, '2026-11-05'), log('x', 1, 3), log('y', 1, 4), log('y', 1, 5), log('z', 1, 6, '2026-09-01'), log('z', 1, 7), log('z', 1, 8)]
  assert.deepEqual([...stubborn(logs, today).keys()], ['x'])
  assert.equal(isMastered(card('m', 30 * 86400000, today, 0)), true)
  assert.equal(isMastered(card('m', 3 * 86400000, today, 0)), false)
})

test('预测灰柱：今天剩余 + 将来到期', () => {
  const words = [W('a'), W('b'), W('n')]
  const cards = new Map([['a', card('a', dayEnd - 1)], ['b', card('b', dayEnd + 1000)]])
  const plan = planToday({ words, cards, todayLogs: [], today, dayEnd, newPerDay: 5, extraNew: 0, coreFirst: false })
  const f = forecastByDay([...cards.values()], plan, new Set(words.map((w) => w.id)), today)
  assert.equal(f.get(today), 2) // a 到期 + 1 个新词
  assert.equal(f.get(addDays(today, 1)), 1)
})

test('备份：日期往返不丢', () => {
  const d = new Date(2026, 0, 2, 3, 4, 5)
  const text = encodeBackup({ cards: [{ fsrs: { dueAt: d, n: 1 } }], logs: [], kv: [{ k: 'settings', v: { a: 1 } }] })
  const back = decodeBackup(text)
  assert.ok((back.cards[0] as { fsrs: { dueAt: Date } }).fsrs.dueAt instanceof Date)
  assert.equal((back.cards[0] as { fsrs: { dueAt: Date } }).fsrs.dueAt.getTime(), d.getTime())
  assert.throws(() => decodeBackup('{"app":"x"}'))
})
