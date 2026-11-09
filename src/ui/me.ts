// 「我的」：概况、顽固词、语言、设置、备份。
import { loadCachedWords, loadToday, saveSettings, state, syncWords, type Today } from '../lib/app.ts'
import { decodeBackup, encodeBackup } from '../lib/codec.ts'
import { allCards, allLogs, kvAll, kvGet, kvSet, replaceAll } from '../lib/db.ts'
import { isMastered, streak, type CardRec, type LogRec, type Word } from '../lib/study.ts'
import { h, icon, sheet, toast } from './dom.ts'
import { previewCard } from './word.ts'

let root: HTMLElement
let t: Today

export async function mountMe(el: HTMLElement): Promise<void> {
  root = el
  t = await loadToday()
  await draw()
}

async function draw(): Promise<void> {
  const s = state.settings
  const studyDays = new Set(t.logs.map((l) => l.day)).size
  const mastered = [...t.cards.values()].filter((c) => state.wordMap.has(c.id) && isMastered(c)).length
  const lastBackup = await kvGet<number>('lastBackup', 0)
  const stale = t.logs.length > 0 && Date.now() - lastBackup > 7 * 86400000
  const langName = state.manifest?.languages.find((l) => l.code === s.lang)?.name ?? s.lang
  const stub = [...t.stubborn.keys()].filter((id) => state.wordMap.has(id))

  const hero = h(
    'div',
    { class: 'hero' },
    stat(streak(t.doneDays, t.today), '连续天数'),
    stat(studyDays, '累计天数'),
    stat(mastered, '已掌握'),
    stat(state.words.length, '词库'),
  )

  const stepper = h(
    'div',
    { class: 'stepper' },
    h('button', { class: 'icon-btn sm', 'aria-label': '减少', onclick: () => setNew(s.newPerDay - 5) }, icon('minus')),
    h('b', {}, s.newPerDay),
    h('button', { class: 'icon-btn sm', 'aria-label': '增加', onclick: () => setNew(s.newPerDay + 5) }, icon('plus')),
  )

  const rate = h('input', { type: 'range', min: '0.5', max: '1.3', step: '0.1', value: String(s.rate), 'aria-label': '语速' }) as HTMLInputElement
  rate.addEventListener('change', async () => { await saveSettings({ rate: Number(rate.value) }) })

  root.replaceChildren(
    h(
      'section',
      { class: 'me' },
      hero,
      group(
        row('语言', h('span', { class: 'val' }, langName, icon('chevron', 'ic sm')), openLanguages),
        row('顽固词', h('span', { class: 'val' }, stub.length, icon('chevron', 'ic sm')), () => openStubborn(stub)),
      ),
      group(
        row('每日新词', stepper),
        row('核心词优先', toggle(s.coreFirst, (v) => saveSettings({ coreFirst: v }))),
        row('自动发音', toggle(s.autoSpeak, (v) => saveSettings({ autoSpeak: v }))),
        row('语速', rate),
        row(
          '卡片方向',
          h(
            'div',
            { class: 'seg sm' },
            h('button', { class: s.reverse ? '' : 'on', onclick: () => saveSettings({ reverse: false }).then(draw) }, '英→中'),
            h('button', { class: s.reverse ? 'on' : '', onclick: () => saveSettings({ reverse: true }).then(draw) }, '中→英'),
          ),
        ),
      ),
      group(
        row(h('span', {}, '导出备份', stale ? h('i', { class: 'reddot' }) : null), icon('chevron', 'ic sm'), exportBackup),
        row('从备份恢复', icon('chevron', 'ic sm'), pickBackup),
        row('检查词库更新', icon('chevron', 'ic sm'), checkUpdate),
      ),
      h('p', { class: 'foot' }, '学习记录只保存在本设备'),
    ),
  )
}

function stat(n: number, label: string) {
  return h('div', {}, h('b', {}, n), h('span', {}, label))
}

function group(...rows: HTMLElement[]) {
  return h('div', { class: 'group' }, ...rows)
}

function row(label: string | Node, right: Node, onclick?: () => void) {
  return h(onclick ? 'button' : 'div', { class: 'row', onclick }, typeof label === 'string' ? h('span', {}, label) : label, right)
}

function toggle(on: boolean, set: (v: boolean) => Promise<void>) {
  const b = h('button', { class: `toggle${on ? ' on' : ''}`, role: 'switch', 'aria-checked': String(on) }, h('i'))
  b.addEventListener('click', async () => {
    on = !on
    b.classList.toggle('on', on)
    b.setAttribute('aria-checked', String(on))
    await set(on)
  })
  return b
}

async function setNew(n: number) {
  await saveSettings({ newPerDay: Math.max(5, Math.min(100, n)) })
  await draw()
}

function openLanguages() {
  const langs = state.manifest?.languages ?? []
  let close = () => {}
  const list = h(
    'div',
    { class: 'group' },
    ...langs.map((l) =>
      row(
        h('span', {}, l.name, h('small', {}, ` ${l.words + l.phrases}`)),
        l.code === state.settings.lang ? icon('check', 'ic sm accent') : h('span'),
        async () => {
          await saveSettings({ lang: l.code })
          await loadCachedWords()
          await syncWords()
          close()
          t = await loadToday()
          await draw()
        },
      ),
    ),
  )
  close = sheet('语言', langs.length ? list : h('p', { class: 'muted center' }, '暂无词库'))
}

function openStubborn(ids: string[]) {
  const words = ids.map((id) => state.wordMap.get(id)!).filter(Boolean)
  let tab: Word['type'] = '单词'
  const body = h('div')
  const render = () => {
    const shown = words.filter((w) => w.type === tab).sort((a, b) => (t.stubborn.get(b.id) ?? 0) - (t.stubborn.get(a.id) ?? 0))
    const counts = { 单词: words.filter((w) => w.type === '单词').length, 短语: words.filter((w) => w.type === '短语').length }
    body.replaceChildren(
      h('div', { class: 'seg wide' }, ...(['单词', '短语'] as const).map((k) => h('button', { class: k === tab ? 'on' : '', onclick: () => { tab = k; render() } }, `${k} ${counts[k]}`))),
      shown.length
        ? h('div', { class: 'group' }, ...shown.map((w, i) => row(h('span', { class: 'two' }, h('b', {}, w.front), h('small', {}, w.meaning)), h('span', { class: 'val' }, `×${t.stubborn.get(w.id)}`), () => browse(shown, i))))
        : h('p', { class: 'muted center' }, '没有'),
    )
  }
  render()
  sheet('顽固词', body)
}

function browse(list: Word[], start: number) {
  let i = start
  const box = h('div', { class: 'browse' })
  const render = () =>
    box.replaceChildren(
      previewCard(list[i]),
      h(
        'div',
        { class: 'pager' },
        h('button', { class: 'icon-btn', 'aria-label': '上一个', disabled: i === 0, onclick: () => { i--; render() } }, icon('prev')),
        h('span', { class: 'muted' }, `${i + 1} / ${list.length}`),
        h('button', { class: 'icon-btn', 'aria-label': '下一个', disabled: i === list.length - 1, onclick: () => { i++; render() } }, icon('next')),
      ),
    )
  render()
  sheet('翻看', box)
}

async function exportBackup() {
  const [cards, logs, kv] = await Promise.all([allCards(), allLogs(), kvAll()])
  const text = encodeBackup({ cards, logs, kv: kv.filter((r) => !r.k.startsWith('words:') && r.k !== 'manifest') })
  const stamp = new Date().toISOString().slice(0, 10)
  const file = new File([text], `背词备份-${stamp}.json`, { type: 'application/json' })
  try {
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] })
    else {
      const a = h('a', { href: URL.createObjectURL(file), download: file.name })
      document.body.append(a)
      a.click()
      a.remove()
    }
    await kvSet('lastBackup', Date.now())
    await draw()
  } catch (e) {
    if ((e as Error).name !== 'AbortError') toast('导出失败')
  }
}

function pickBackup() {
  const input = h('input', { type: 'file', accept: 'application/json,.json' }) as HTMLInputElement
  input.addEventListener('change', async () => {
    const f = input.files?.[0]
    if (!f) return
    try {
      const data = decodeBackup(await f.text())
      const logs = data.logs as LogRec[]
      const days = logs.map((l) => l.day).sort()
      let close = () => {}
      const body = h(
        'div',
        { class: 'restore' },
        h(
          'div',
          { class: 'group' },
          row('导出时间', h('span', { class: 'val' }, data.exportedAt.slice(0, 16).replace('T', ' '))),
          row('词卡', h('span', { class: 'val' }, data.cards.length)),
          row('复习记录', h('span', { class: 'val' }, logs.length)),
          row('日期', h('span', { class: 'val' }, days.length ? `${days[0]} ~ ${days[days.length - 1]}` : '—')),
        ),
        h('button', {
          class: 'pill danger',
          onclick: async () => {
            if (!confirm('恢复会覆盖这台设备上现在的学习记录，确定吗？')) return
            await replaceAll(data.cards as CardRec[], logs, data.kv)
            close()
            location.reload()
          },
        }, '覆盖并恢复'),
      )
      close = sheet('从备份恢复', body)
    } catch (e) {
      toast((e as Error).message || '文件无法读取')
    }
  })
  input.click()
}

async function checkUpdate() {
  const r = await syncWords()
  if (!r.ok) toast('连不上，稍后再试')
  else if (!r.updated) toast('已是最新')
  else toast(r.added ? `新增 ${r.added} 个词` : '词库已更新')
  t = await loadToday()
  await draw()
}
