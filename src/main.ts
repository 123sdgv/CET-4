import './styles.css'
import { loadCachedWords, loadSettings, syncWords } from './lib/app.ts'
import { h, icon, toast } from './ui/dom.ts'
import { mountMe } from './ui/me.ts'
import { mountStats } from './ui/stats.ts'
import { isIdle, mountWord } from './ui/word.ts'

type Tab = 'word' | 'stats' | 'me'
let tab: Tab = 'word'
const view = h('main', { id: 'view' })
const nav = h('nav', { class: 'tabs' })

const TABS: { id: Tab; label: string; off: Parameters<typeof icon>[0]; on: Parameters<typeof icon>[0] }[] = [
  { id: 'word', label: '单词', off: 'cards', on: 'cardsOn' },
  { id: 'stats', label: '统计', off: 'chart', on: 'chart' },
  { id: 'me', label: '我的', off: 'user', on: 'userOn' },
]

function drawNav() {
  nav.replaceChildren(
    ...TABS.map((t) =>
      h('button', { class: t.id === tab ? 'on' : '', 'aria-label': t.label, 'aria-current': t.id === tab ? 'page' : null, onclick: () => go(t.id) }, icon(t.id === tab ? t.on : t.off)),
    ),
  )
}

async function go(next: Tab) {
  tab = next
  drawNav()
  view.scrollTop = 0
  if (tab === 'word') await mountWord(view)
  else if (tab === 'stats') await mountStats(view)
  else await mountMe(view)
}

async function start() {
  document.body.append(h('div', { class: 'app' }, view, nav))
  navigator.storage?.persist?.().catch(() => {})
  await loadSettings()
  await loadCachedWords()
  await go('word')
  const r = await syncWords()
  if (r.updated && (tab !== 'word' || isIdle())) await go(tab)
  if (r.added) toast(`新增 ${r.added} 个词`)
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    const base = import.meta.env.BASE_URL
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).then(async () => {
      const reg = await navigator.serviceWorker.ready
      const urls = [location.href.split('#')[0], ...performance.getEntriesByType('resource').map((e) => e.name).filter((u) => u.startsWith(location.origin))]
      reg.active?.postMessage({ type: 'cache', urls })
    }).catch(() => {})
  }
}

start().catch((e) => {
  console.error(e)
  document.body.textContent = '加载失败：' + (e as Error).message
})
