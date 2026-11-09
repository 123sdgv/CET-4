// 把 vocab/<语言代码>/*.csv 校验、合并、去重，生成 public/data/<语言>.json 和 manifest.json。
// 用法：node scripts/merge-vocab.mjs
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parseCsv, CsvError } from './csv.mjs'

export const HEADER = [
  'id', 'type', 'front', 'meaning_zh', 'pos', 'usage', 'source_context',
  'example_en', 'example_zh', 'priority', 'origin', 'source_id',
]

export const LANG_NAMES = {
  en: '英语', ja: '日语', ko: '韩语', fr: '法语', de: '德语', es: '西班牙语',
  it: '意大利语', ru: '俄语', pt: '葡萄牙语',
}

const TYPES = { 单词: 'w_', 短语: 'p_' }
const PRIORITIES = new Set(['核心', '拓展'])

export function normalizeFront(front) {
  return front.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function makeId(type, front) {
  const hash = createHash('sha1').update(normalizeFront(front), 'utf8').digest('hex').slice(0, 12)
  return TYPES[type] + hash
}

export function decodeUtf8(buf, file) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    throw new CsvError(`${file} 不是 UTF-8 编码`, 1)
  }
}

/** 校验一个 CSV 文件的文本，返回 { entries, errors }。errors 带行号。 */
export function readCsvText(text, file) {
  const errors = []
  const entries = []
  let rows
  try {
    rows = parseCsv(text)
  } catch (e) {
    if (e instanceof CsvError) return { entries, errors: [`${file} 第 ${e.line} 行：${e.message}`] }
    throw e
  }
  if (!rows.length) return { entries, errors: [`${file}：文件是空的`] }
  const head = rows[0].fields.map((f) => f.trim())
  if (head.join(',') !== HEADER.join(',')) {
    errors.push(`${file} 第 1 行：表头必须是 ${HEADER.join(',')}`)
    return { entries, errors }
  }
  const sidFallback = basename(file).replace(/\.csv$/i, '')
  for (const { fields, line } of rows.slice(1)) {
    const at = `${file} 第 ${line} 行`
    if (fields.length !== HEADER.length) {
      errors.push(`${at}：应有 ${HEADER.length} 列，实际 ${fields.length} 列（检查逗号和引号）`)
      continue
    }
    const r = Object.fromEntries(HEADER.map((k, i) => [k, fields[i].trim()]))
    if (!TYPES[r.type]) { errors.push(`${at}：type 只能是「单词」或「短语」，现在是「${r.type}」`); continue }
    if (!r.front) { errors.push(`${at}：front 不能为空`); continue }
    if (!r.meaning_zh) { errors.push(`${at}：meaning_zh 不能为空`); continue }
    if (!PRIORITIES.has(r.priority)) { errors.push(`${at}：priority 只能是「核心」或「拓展」，现在是「${r.priority}」`); continue }
    const expected = makeId(r.type, r.front)
    if (r.id && r.id !== expected) { errors.push(`${at}：id 应为 ${expected}，现在是 ${r.id}`); continue }
    entries.push({
      id: expected,
      type: r.type,
      front: r.front.replace(/\s+/g, ' '),
      meaning: r.meaning_zh,
      pos: r.pos,
      usage: r.usage,
      exEn: r.example_en,
      exZh: r.example_zh,
      priority: r.priority,
      source: { sid: r.source_id || sidFallback, origin: r.origin, ctx: r.source_context },
    })
  }
  return { entries, errors }
}

/** files: [{ file, entries }]，按上传先后排好。后上传的内容为准，来源全部保留。 */
export function mergeEntries(files) {
  const map = new Map()
  for (const { entries } of files) {
    for (const e of entries) {
      const old = map.get(e.id)
      if (!old) {
        const { source, ...rest } = e
        map.set(e.id, { ...rest, sources: [source] })
        continue
      }
      for (const k of ['front', 'meaning', 'pos', 'usage', 'exEn', 'exZh']) if (e[k]) old[k] = e[k]
      if (e.priority === '核心') old.priority = '核心'
      old.sources.push(e.source)
    }
  }
  const words = [...map.values()]
  for (const w of words) w.sources = dedupeSources(w.sources)
  return words
}

function dedupeSources(list) {
  const seen = new Set()
  const out = []
  for (const s of list) {
    const key = `${s.sid}\u0000${s.ctx}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
  }
  const withCtx = new Set(out.filter((s) => s.ctx).map((s) => s.sid))
  return out.filter((s) => s.ctx || !withCtx.has(s.sid))
}

function commitTime(path) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%ct', '--', path], { encoding: 'utf8' }).trim()
    if (out) return Number(out)
  } catch {}
  return Math.floor(statSync(path).mtimeMs / 1000)
}

export function buildAll(vocabDir, outDir) {
  const errors = []
  const languages = []
  const lists = []
  const langs = existsSync(vocabDir)
    ? readdirSync(vocabDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()
    : []
  for (const lang of langs) {
    const dir = join(vocabDir, lang)
    const csvs = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.csv'))
    const files = csvs
      .map((f) => ({ name: f, path: join(dir, f) }))
      .map((f) => ({ ...f, time: commitTime(f.path) }))
      .sort((a, b) => a.time - b.time || a.name.localeCompare(b.name))
      .map(({ name, path }) => {
        const label = `vocab/${lang}/${name}`
        try {
          const res = readCsvText(decodeUtf8(readFileSync(path), label), label)
          errors.push(...res.errors)
          return { file: label, entries: res.entries }
        } catch (e) {
          errors.push(e instanceof CsvError ? e.message : String(e))
          return { file: label, entries: [] }
        }
      })
    const words = mergeEntries(files)
    if (!words.length) continue
    const version = createHash('sha1').update(JSON.stringify(words)).digest('hex').slice(0, 12)
    lists.push({ lang, version, words })
    languages.push({
      code: lang,
      name: LANG_NAMES[lang] || lang,
      version,
      words: words.filter((w) => w.type === '单词').length,
      phrases: words.filter((w) => w.type === '短语').length,
    })
  }
  if (errors.length) return { errors }
  mkdirSync(outDir, { recursive: true })
  for (const list of lists) writeFileSync(join(outDir, `${list.lang}.json`), JSON.stringify(list))
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify({ generated: new Date().toISOString(), languages }))
  return { errors, languages }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { errors, languages } = buildAll('vocab', join('public', 'data'))
  if (errors.length) {
    console.error('词库校验失败：\n' + errors.map((e) => '  - ' + e).join('\n'))
    process.exit(1)
  }
  for (const l of languages) console.log(`${l.name}（${l.code}）：单词 ${l.words}，短语 ${l.phrases}，版本 ${l.version}`)
}
