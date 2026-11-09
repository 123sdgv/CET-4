// 「统计」：日 / 周 / 月柱状图。彩色是真实记录，灰色是预计要复习的数量。
import { loadToday, state, type Today } from '../lib/app.ts'
import { fillBuckets, formatDuration, makeBuckets, niceMax, PAST, total, type Bucket, type View } from '../lib/stats.ts'
import { forecastByDay } from '../lib/study.ts'
import { h } from './dom.ts'

let view: View = 'week'
let sel = PAST
let root: HTMLElement
let t: Today

export async function mountStats(el: HTMLElement): Promise<void> {
  root = el
  t = await loadToday()
  draw()
}

const C = { good: 'var(--good)', hard: 'var(--hard)', again: 'var(--again)', gray: 'var(--forecast)' }

function chart(bs: Bucket[]): SVGSVGElement {
  const W = 340, H = 230, L = 26, B = 34, T = 8
  const { max, step } = niceMax(Math.max(1, ...bs.map((b) => total(b) + (b.rel >= 0 ? b.forecast : 0))))
  const slot = (W - L) / bs.length
  const bw = Math.min(20, slot * 0.6)
  const y = (v: number) => H - B - (v / max) * (H - B - T)
  let s = ''
  for (let v = 0; v <= max; v += step) {
    s += `<line x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L - 6}" y="${y(v) + 3.5}" class="axis" text-anchor="end">${Math.round(v)}</text>`
  }
  bs.forEach((b, i) => {
    const x = L + slot * i + (slot - bw) / 2
    const cx = L + slot * i + slot / 2
    if (i === sel) s += `<rect x="${L + slot * i + 2}" y="${T}" width="${slot - 4}" height="${H - B - T}" rx="6" class="selbg"/>`
    let acc = 0
    const seg = (v: number, color: string) => {
      if (v <= 0) return
      const y1 = y(acc + v), y0 = y(acc)
      s += `<rect x="${x}" y="${y1}" width="${bw}" height="${Math.max(0, y0 - y1)}" fill="${color}"/>`
      acc += v
    }
    if (b.rel <= 0) { seg(b.good, C.good); seg(b.hard, C.hard); seg(b.again, C.again) }
    if (b.rel >= 0) seg(b.forecast, C.gray)
    const label = b.label
    const cls = i === sel ? 'xlab on' : 'xlab'
    s += `<text x="${cx}" y="${H - B + 16}" class="${cls}" text-anchor="middle">${label}</text>`
    s += `<rect x="${L + slot * i}" y="0" width="${slot}" height="${H}" fill="transparent" data-i="${i}" class="hit"/>`
  })
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  el.setAttribute('viewBox', `0 0 ${W} ${H}`)
  el.setAttribute('class', 'chart')
  el.innerHTML = s
  el.addEventListener('click', (e) => {
    const i = (e.target as Element).getAttribute('data-i')
    if (i != null) { sel = Number(i); draw() }
  })
  return el
}

function draw(): void {
  const wordIds = new Set(state.words.map((w) => w.id))
  const cards = [...t.cards.values()]
  const fc = forecastByDay(cards, t.plan, wordIds, t.today)
  const bs = fillBuckets(makeBuckets(view, t.today), t.logs, fc, t.today)
  const b = bs[sel]
  const seg = h(
    'div',
    { class: 'seg' },
    ...(['day', 'week', 'month'] as View[]).map((v) =>
      h('button', { class: v === view ? 'on' : '', onclick: () => { view = v; sel = PAST; draw() } }, { day: '日', week: '周', month: '月' }[v]),
    ),
  )
  const range = b.start === b.end ? b.start : `${b.start.slice(5)} ~ ${b.end.slice(5)}`
  const legend = h(
    'div',
    { class: 'legend' },
    h('p', { class: 'range' }, `${b.label} · ${range}`),
    h(
      'div',
      { class: 'lg' },
      item('good', '认识', b.good),
      item('hard', '眼熟', b.hard),
      item('again', '不认识', b.again),
      b.rel >= 0 ? item('forecast', b.rel === 0 ? '待学' : '预计', b.forecast) : null,
      b.rel <= 0 ? h('span', { class: 'li' }, h('i', { class: 'dot time' }), '时长 ', h('b', {}, formatDuration(b.ms))) : null,
    ),
  )
  const reviewedToday = new Set(t.todayLogs.map((l) => l.id)).size
  const tiles = h(
    'div',
    { class: 'tiles' },
    tile(t.todayLogs.length, '今日复习次数'),
    tile(reviewedToday, '今日词卡'),
    tile(cards.filter((c) => wordIds.has(c.id)).length, '累计学过'),
    tile(t.plan.dueLeft, '当前待复习'),
    tile(state.words.filter((w) => w.type === '单词').length, '单词'),
    tile(state.words.filter((w) => w.type === '短语').length, '短语'),
  )
  root.replaceChildren(h('section', { class: 'stats' }, h('header', { class: 'stop' }, seg), h('div', { class: 'panel' }, chart(bs), legend), tiles))
}

function item(k: string, name: string, n: number) {
  return h('span', { class: 'li' }, h('i', { class: `dot ${k}` }), `${name} `, h('b', {}, n))
}

function tile(n: number, label: string) {
  return h('div', { class: 'tile' }, h('b', {}, n), h('span', {}, label))
}
