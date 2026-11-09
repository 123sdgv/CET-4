// 极简 DOM 工具 + 图标。
type Child = Node | string | number | null | undefined | false
type Props = Record<string, unknown>

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...kids: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue
    if (k === 'class') el.className = String(v)
    else if (k === 'html') el.innerHTML = String(v)
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener)
    else el.setAttribute(k, v === true ? '' : String(v))
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(typeof c === 'number' ? String(c) : c)
  return el
}

const svg = (body: string, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}>${body}</svg>`

export const ICONS = {
  cards: svg('<rect x="3.5" y="7" width="12.5" height="14" rx="2.6"/><path d="M8 3.6h9.4A2.6 2.6 0 0 1 20 6.2V16.5"/>'),
  cardsOn: svg('<rect x="3.5" y="7" width="12.5" height="14" rx="2.6" fill="currentColor" fill-opacity=".16"/><path d="M8 3.6h9.4A2.6 2.6 0 0 1 20 6.2V16.5"/>', ''),
  chart: svg('<path d="M5.5 20.5v-6.5M12 20.5V4.5M18.5 20.5v-10"/>', 'stroke-width="2.4"'),
  user: svg('<circle cx="12" cy="8.6" r="3.9"/><path d="M4.6 20.4c1.3-3.8 4.2-5.7 7.4-5.7s6.1 1.9 7.4 5.7"/>'),
  userOn: svg('<circle cx="12" cy="8.6" r="3.9" fill="currentColor" fill-opacity=".16"/><path d="M4.6 20.4c1.3-3.8 4.2-5.7 7.4-5.7s6.1 1.9 7.4 5.7"/>'),
  speaker: svg('<path d="M4.5 9.6h3.2L12 5.8v12.4l-4.3-3.8H4.5z" fill="currentColor"/><path d="M15.6 9.2a4 4 0 0 1 0 5.6M18.2 6.6a7.6 7.6 0 0 1 0 10.8"/>'),
  undo: svg('<path d="M8.5 6.5 4.5 10.5l4 4"/><path d="M4.8 10.5h9.2a5 5 0 0 1 0 10H11"/>'),
  chevron: svg('<path d="m9.5 6 6 6-6 6"/>'),
  back: svg('<path d="m14.5 6-6 6 6 6"/>'),
  check: svg('<path d="m5.5 12.5 4.2 4.2 8.8-9.2"/>', 'stroke-width="2.4"'),
  close: svg('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>'),
  minus: svg('<path d="M6 12h12"/>'),
  plus: svg('<path d="M6 12h12M12 6v12"/>'),
  prev: svg('<path d="m14.5 6-6 6 6 6"/>'),
  next: svg('<path d="m9.5 6 6 6-6 6"/>'),
}

export function icon(name: keyof typeof ICONS, cls = 'ic'): HTMLSpanElement {
  return h('span', { class: cls, html: ICONS[name], 'aria-hidden': 'true' })
}

let toastTimer = 0
export function toast(msg: string): void {
  let el = document.getElementById('toast')
  if (!el) {
    el = h('div', { id: 'toast', role: 'status' })
    document.body.append(el)
  }
  el.textContent = msg
  el.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => el!.classList.remove('show'), 2000)
}

/** 全屏子页面（从右侧滑入），返回关闭函数。 */
export function sheet(title: string, body: Node, onClose?: () => void): () => void {
  const close = () => {
    panel.classList.remove('in')
    setTimeout(() => panel.remove(), 220)
    onClose?.()
  }
  const panel = h(
    'div',
    { class: 'sheet', role: 'dialog', 'aria-label': title },
    h('header', { class: 'sheet-top' }, h('button', { class: 'icon-btn', 'aria-label': '返回', onclick: close }, icon('back')), h('h2', {}, title), h('span', { class: 'icon-btn ghost' })),
    h('div', { class: 'sheet-body' }, body),
  )
  document.body.append(panel)
  requestAnimationFrame(() => panel.classList.add('in'))
  return close
}

export function sourceLabel(sid: string): string {
  const m = sid.match(/^CET(\d)-(\d{4})-(\d{2})-S(\d)/i)
  return m ? `${m[2]}年${Number(m[3])}月 ${m[1] === '6' ? '六' : '四'}级 第${m[4]}套` : sid
}
