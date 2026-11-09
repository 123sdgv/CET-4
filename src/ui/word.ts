// 「单词」：默认首页，一张卡片 + 三个评分按钮。
import { addExtraNew, loadToday, markDone, state, type Today } from '../lib/app.ts'
import { saveReview, undoReview } from '../lib/db.ts'
import { studyDay } from '../lib/day.ts'
import { review } from '../lib/fsrs.ts'
import { speak } from '../lib/speech.ts'
import { afterGrade, gradesById, todayState, type Grade, type LogRec, type Word } from '../lib/study.ts'
import { h, icon, sourceLabel, toast } from './dom.ts'

let root: HTMLElement
let t: Today
let queue: string[] = []
let flipped = false
let busy = false
let shownAt = Date.now()
let spokenFor = ''

export async function mountWord(el: HTMLElement): Promise<void> {
  root = el
  await reload()
}

export function isIdle(): boolean {
  return !flipped && !busy
}

async function reload(front?: string): Promise<void> {
  t = await loadToday()
  queue = t.plan.queue
  if (front) queue = [front, ...queue.filter((x) => x !== front)]
  flipped = false
  shownAt = Date.now()
  spokenFor = ''
  draw()
}

function speakWord(w: Word) {
  speak(w.front, state.settings.lang, state.settings.rate)
}

export function cardFace(w: Word, open: boolean, onFlip?: () => void): HTMLElement {
  const reverse = state.settings.reverse
  const speakBtn = h('button', { class: 'speak', 'aria-label': '朗读', onclick: (e: Event) => { e.stopPropagation(); speakWord(w) } }, icon('speaker'))
  const head = reverse
    ? h('div', { class: 'face' }, h('p', { class: 'front zh-front' }, w.meaning))
    : h('div', { class: 'face' }, h('h1', { class: 'front', lang: state.settings.lang }, w.front), speakBtn)
  const back = open
    ? h(
        'div',
        { class: 'back' },
        reverse ? h('div', { class: 'face sub' }, h('h2', { class: 'front small', lang: state.settings.lang }, w.front), speakBtn) : h('p', { class: 'meaning' }, w.meaning),
        w.pos || w.usage ? h('p', { class: 'usage' }, w.pos ? h('em', {}, w.pos) : null, w.usage) : null,
        ...w.sources.filter((s) => s.ctx).map((s) =>
          h('div', { class: 'block' }, h('span', { class: 'tag real' }, '真题'), h('p', { class: 'ctx', lang: state.settings.lang }, s.ctx), h('p', { class: 'src' }, sourceLabel(s.sid))),
        ),
        w.exEn ? h('div', { class: 'block' }, h('span', { class: 'tag' }, '例句'), h('p', { class: 'ctx', lang: state.settings.lang }, w.exEn), w.exZh ? h('p', { class: 'zh' }, w.exZh) : null) : null,
      )
    : null
  return h(
    'article',
    { class: `card${open ? ' open' : ''}`, onclick: () => onFlip?.() },
    w.priority === '核心' ? h('span', { class: 'core', title: '核心' }) : null,
    head,
    back,
  )
}

function draw(): void {
  const p = t.plan
  const lastLog = lastToday()
  const passed = new Set(p.passed).size
  const left = Math.max(0, p.dueLeft) + p.newLeft
  const pct = passed + left ? Math.round((passed / (passed + left)) * 100) : 100
  const top = h(
    'header',
    { class: 'wtop' },
    h('button', { class: 'icon-btn', 'aria-label': '撤回上一次', disabled: !lastLog || busy, onclick: undo }, icon('undo')),
    h(
      'div',
      { class: 'counts' },
      h('span', {}, h('b', {}, p.dueLeft), '复习'),
      h('span', {}, h('b', {}, p.newLeft), '新词'),
      h('span', {}, h('b', {}, passed), '已过关'),
    ),
  )
  const bar = h('div', { class: 'progress' }, h('i', { style: `width:${pct}%` }))
  const id = queue[0]
  const w = id ? state.wordMap.get(id) : undefined
  if (!w) {
    root.replaceChildren(h('section', { class: 'word' }, top, bar, doneView()))
    if (t.todayLogs.length && !t.doneDays.includes(t.today)) markDone(t.today)
    return
  }
  const actions = flipped
    ? h(
        'footer',
        { class: 'grades' },
        h('button', { class: 'g again', onclick: () => grade(1) }, '不认识'),
        h('button', { class: 'g hard', onclick: () => grade(2) }, '眼熟'),
        h('button', { class: 'g good', onclick: () => grade(3) }, '认识'),
      )
    : h('footer', { class: 'grades' }, h('button', { class: 'g reveal', onclick: flip }, '查看释义'))
  root.replaceChildren(h('section', { class: 'word' }, top, bar, h('div', { class: 'stage' }, cardFace(w, flipped, flipped ? undefined : flip)), actions))
  const reverse = state.settings.reverse
  const key = `${w.id}:${queue.length}:${t.todayLogs.length}`
  if (state.settings.autoSpeak && (reverse ? flipped : !flipped) && spokenFor !== key) {
    spokenFor = key
    speakWord(w)
  }
}

function flip(): void {
  if (flipped) return
  flipped = true
  draw()
}

function lastToday(): LogRec | undefined {
  return t.todayLogs.reduce<LogRec | undefined>((a, b) => (!a || b.ts > a.ts ? b : a), undefined)
}

async function grade(g: Grade): Promise<void> {
  const id = queue[0]
  if (busy || !id || !flipped) return
  busy = true
  try {
    const now = new Date()
    const today = studyDay(now)
    if (today !== t.today) { await reload(); return }
    const prev = t.cards.get(id) ?? null
    const next = await review(prev, state.settings.lang, id, g, now, today, t.stubborn.has(id))
    const log: LogRec = {
      lang: state.settings.lang,
      id,
      g,
      day: today,
      ts: now.getTime(),
      ms: Math.min(60000, now.getTime() - shownAt),
      prev: prev ? { due: prev.due, last: prev.last, firstDay: prev.firstDay, fsrs: prev.fsrs } : null,
    }
    log.n = await saveReview(next, log)
    const nq = afterGrade(queue, id, g, todayState(gradesById([...t.todayLogs, log]).get(id)!.grades))
    t = await loadToday()
    queue = nq.length ? nq.filter((x) => t.plan.queue.includes(x)) : t.plan.queue
    for (const x of t.plan.queue) if (!queue.includes(x)) queue.push(x)
  } catch (e) {
    console.error(e)
    toast('保存失败，请重试')
  } finally {
    busy = false
    flipped = false
    shownAt = Date.now()
    draw()
  }
}

async function undo(): Promise<void> {
  const log = lastToday()
  if (!log || busy) return
  busy = true
  try {
    await undoReview(log)
  } finally {
    busy = false
  }
  await reload(log.id)
}

function doneView(): HTMLElement {
  const p = t.plan
  if (!state.words.length) return h('div', { class: 'done' }, h('p', { class: 'muted' }, '词库还是空的'))
  const reviewed = new Set(t.todayLogs.map((l) => l.id)).size
  return h(
    'div',
    { class: 'done' },
    h('div', { class: 'done-mark' }, icon('check')),
    h('h2', {}, '今天完成了'),
    h('p', { class: 'muted' }, `背了 ${reviewed} 个 · 新学 ${p.newIntroduced} 个`),
    p.freshLeft > 0
      ? h('button', { class: 'pill', onclick: async () => { await addExtraNew(t.today, 5); await reload() } }, '再学 5 个')
      : null,
  )
}

/** 针对单个词显示卡片（顽固词页面用，只翻看不记录）。 */
export function previewCard(w: Word): HTMLElement {
  let open = false
  const wrap = h('div', { class: 'stage' })
  const render = () => wrap.replaceChildren(cardFace(w, open, () => { open = !open; render() }))
  render()
  return wrap
}
