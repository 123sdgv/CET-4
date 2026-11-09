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

function chart(bs: Bucket[]): SVGSVGElement {
  const W = 360, H = 420, L = 4, R = 30, B = 30, T = 14
  const { max, step } = niceMax(Math.max(1, ...bs.map((b) => total(b) + (b.rel >= 0 ? b.forecast : 0))))
  const slot = (W - L - R) / bs.length
  const bw = Math.min(24, slot * 0.66)
  const base = H - B
  const y = (v: number) => base - (v / max) * (base - T)
  let s = ''
  for (let v = step; v <= max; v += step) {
    s += `<line x1="${L}" x2="${W - R + 4}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${W - 2}" y="${y(v) + 4}" class="axis" text-anchor="end">${v}</text>`
  }
  s += `<line x1="${L}" x2="${W - R + 4}" y1="${base}" y2="${base}" class="baseline"/>`
  bs.forEach((b, i) => {
    const x = L + slot * i + (slot - bw) / 2
    const cx = L + slot * i + slot / 2
    const parts: [number, string][] = []
    if (b.rel <= 0) parts.push([b.good, 'good'], [b.hard, 'hard'], [b.again, 'again'])
    if (b.rel >= 0) parts.push([b.forecast, 'forecast'])
    const sum = parts.reduce((a, [v]) => a + v, 0)
    if (sum > 0) {
      const top = y(sum)
      s += `<clipPath id="bar${i}"><rect x="${x}" y="${top}" width="${bw}" height="${base - top + 8}" rx="7"/></clipPath><g clip-path="url(#bar${i})">`
      let acc = 0
      for (const [v, k] of parts) {
        if (v <= 0) continue
        const y1 = y(acc + v), y0 = y(acc)
        s += `<rect x="${x}" y="${y1}" width="${bw}" height="${y0 - y1}" class="seg-${k}${i === sel ? '' : ' dim'}"/>`
        if (acc > 0) s += `<rect x="${x}" y="${y0 - 1}" width="${bw}" height="2" class="gap"/>`
        acc += v
      }
      s += '</g>'
    }
    s += `<text x="${cx}" y="${H - 8}" class="${i === sel ? 'xlab on' : 'xlab'}" text-anchor="middle">${b.label}</text>`
    s += `<rect x="${L + slot * i}" y="0" width="${slot}" height="${H}" fill="transparent" data-i="${i}"/>`
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
  const fc = forecastByDay([...t.cards.values()], t.plan, wordIds, t.today)
  const bs = fillBuckets(makeBuckets(view, t.today), t.logs, fc, t.today)
  const b = bs[sel]
  const cardsIn = new Set(t.logs.filter((l) => l.day >= b.start && l.day <= b.end).map((l) => l.id)).size
  const range = b.start === b.end ? b.start.slice(5).replace('-', '/') : `${b.start.slice(5).replace('-', '/')} – ${b.end.slice(5).replace('-', '/')}`
  const seg = h(
    'div',
    { class: 'seg' },
    ...(['day', 'week', 'month'] as View[]).map((v) =>
      h('button', { class: v === view ? 'on' : '', onclick: () => { view = v; sel = PAST; draw() } }, { day: '日', week: '周', month: '月' }[v]),
    ),
  )
  const head =
    b.rel > 0
      ? h('div', { class: 'sum' }, h('p', { class: 'when' }, `${b.label} · ${range}`), h('p', { class: 'big' }, b.forecast, h('small', {}, ' 张待复习')))
      : h(
          'div',
          { class: 'sum' },
          h('p', { class: 'when' }, `${b.label} · ${range}`),
          h('p', { class: 'big' }, total(b), h('small', {}, ' 次'), h('span', { class: 'sub' }, `${cardsIn} 张词卡 · ${formatDuration(b.ms)}`)),
        )
  const chips = h(
    'div',
    { class: 'chips' },
    chip('good', '认识', b.good, b.rel > 0),
    chip('hard', '眼熟', b.hard, b.rel > 0),
    chip('again', '不认识', b.again, b.rel > 0),
    b.rel >= 0 ? chip('forecast', b.rel === 0 ? '待学' : '预计', b.forecast, false) : null,
  )
  root.replaceChildren(h('section', { class: 'stats' }, h('header', { class: 'stop' }, head, seg), h('div', { class: 'panel' }, chart(bs)), chips))
}

function chip(k: string, name: string, n: number, hide: boolean) {
  return hide ? null : h('span', { class: 'chip' }, h('i', { class: `dot ${k}` }), name, h('b', {}, n))
}
