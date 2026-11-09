// 备份文件的编码：Date 存成 {"$d": 毫秒}，读回来还原成 Date。
export const BACKUP_APP = 'cet-vocab'
export const BACKUP_SCHEMA = 1

export interface Backup {
  app: string
  schema: number
  exportedAt: string
  cards: unknown[]
  logs: unknown[]
  kv: { k: string; v: unknown }[]
}

export function encodeBackup(data: Omit<Backup, 'app' | 'schema' | 'exportedAt'>, now = new Date()): string {
  const body: Backup = { app: BACKUP_APP, schema: BACKUP_SCHEMA, exportedAt: now.toISOString(), ...data }
  return JSON.stringify(body, function (this: Record<string, unknown>, key, value) {
    const raw = this[key]
    return raw instanceof Date ? { $d: raw.getTime() } : value
  })
}

export function decodeBackup(text: string): Backup {
  const data = JSON.parse(text, (_k, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.$d === 'number' && Object.keys(v).length === 1) return new Date(v.$d)
    return v
  })
  if (!data || data.app !== BACKUP_APP || !Array.isArray(data.cards) || !Array.isArray(data.logs) || !Array.isArray(data.kv)) {
    throw new Error('这不是本应用导出的备份文件')
  }
  return data as Backup
}
