// 严格的 CSV 解析（RFC 4180）：支持引号、转义双引号、字段内换行、CRLF、BOM。
// 出错时抛出带行号的 CsvError，绝不悄悄丢数据。

export class CsvError extends Error {
  constructor(message, line) {
    super(message)
    this.line = line
  }
}

export function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

export function parseCsv(input) {
  const text = stripBom(input)
  const rows = []
  let fields = []
  let field = ''
  let inQuote = false
  let line = 1
  let rowLine = 1
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (inQuote) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuote = false
        i++
        const n = text[i]
        if (n !== undefined && n !== ',' && n !== '\n' && n !== '\r') {
          throw new CsvError('引号闭合后还有多余字符（字段里的引号要写成两个 ""）', rowLine)
        }
        continue
      }
      if (c === '\n') line++
      field += c
      i++
      continue
    }
    if (c === '"') {
      if (field.length) throw new CsvError('字段中间出现了未转义的引号', rowLine)
      inQuote = true
      i++
      continue
    }
    if (c === ',') {
      fields.push(field)
      field = ''
      i++
      continue
    }
    if (c === '\r' || c === '\n') {
      fields.push(field)
      rows.push({ fields, line: rowLine })
      fields = []
      field = ''
      if (c === '\r' && text[i + 1] === '\n') i++
      i++
      line++
      rowLine = line
      continue
    }
    field += c
    i++
  }
  if (inQuote) throw new CsvError('引号没有闭合', rowLine)
  if (field.length || fields.length) {
    fields.push(field)
    rows.push({ fields, line: rowLine })
  }
  return rows.filter((r) => !(r.fields.length === 1 && r.fields[0].trim() === ''))
}
