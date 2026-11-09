// 需要安装 ts-fsrs（GitHub Actions 里会安装）。本地没装时跳过。
import { test } from 'node:test'
import assert from 'node:assert/strict'

let mod: typeof import('../src/lib/fsrs.ts') | null = null
try {
  mod = await import('../src/lib/fsrs.ts')
} catch {}

test('ts-fsrs：新卡评分 → 旧卡继续评分，到期时间合理', { skip: !mod && '未安装 ts-fsrs' }, async () => {
  const now = new Date(2026, 10, 9, 9)
  const a = await mod!.review(null, 'en', 'w_x', 3, now, '2026-11-09', false)
  assert.ok(a.due > now.getTime(), '认识后应该排到以后')
  assert.equal(a.firstDay, '2026-11-09')
  const later = new Date(a.due + 3600000)
  const b = await mod!.review(a, 'en', 'w_x', 3, later, '2026-11-20', false)
  assert.ok(b.due - later.getTime() > a.due - now.getTime(), '连续认识间隔变长')
  assert.equal(b.firstDay, '2026-11-09', '第一次学习日不变')
  const c = await mod!.review(b, 'en', 'w_x', 1, new Date(b.due), '2026-12-30', false)
  assert.ok(c.due - b.due < b.due - later.getTime(), '不认识后间隔变短')
  const s = await mod!.review(null, 'en', 'w_y', 3, now, '2026-11-09', true)
  assert.ok(s.due <= a.due, '顽固词排得更近')
})
