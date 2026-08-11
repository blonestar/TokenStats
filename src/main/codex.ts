import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, lstatSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { Warning } from '../shared/contracts'
import type { TokenDatabase, UsageEvent } from './database'

const SOURCE_ID = 'codex-current-user'
const PARSER_VERSION = 'codex-jsonl-v2'
const MAX_WARNINGS = 20
const UNKNOWN_MODEL = 'Unknown'
type Json = Record<string, unknown>
const safeNumber = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
const text = (value: unknown): string | null => typeof value === 'string' && value.length <= 200 ? value : null
const modelName = (value: unknown): string | null => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 100 ? value.trim() : null
const usageKeys = [['input_tokens', 'inputTokens'], ['output_tokens', 'outputTokens'], ['cached_input_tokens', 'cachedInputTokens'], ['cache_write_input_tokens', 'cacheWriteInputTokens'], ['reasoning_output_tokens', 'reasoningOutputTokens'], ['total_tokens', 'totalTokens']] as const

export function extractModel(line: string): string | null {
  const record = JSON.parse(line) as Json
  if (record.type !== 'turn_context') return null
  return modelName((record.payload as Json | undefined)?.model)
}

export function extractEvent(line: string, relativeFile: string, byteOffset: number, model = UNKNOWN_MODEL): UsageEvent | null {
  const record = JSON.parse(line) as Json
  if (record.type !== 'event_msg') return null
  const payload = record.payload as Json | undefined
  const info = payload?.info as Json | undefined
  const usage = info?.last_token_usage as Json | undefined
  const timestamp = text(record.timestamp)
  if (!usage || !timestamp) return null
  const event = { inputTokens: null, outputTokens: null, cachedInputTokens: null, cacheWriteInputTokens: null, reasoningOutputTokens: null, totalTokens: null } as Pick<UsageEvent, 'inputTokens' | 'outputTokens' | 'cachedInputTokens' | 'cacheWriteInputTokens' | 'reasoningOutputTokens' | 'totalTokens'>
  let numeric = false
  for (const [source, target] of usageKeys) { const n = safeNumber(usage[source]); if (n !== null) { event[target] = n; numeric = true } else if (usage[source] !== undefined) throw new Error('invalid token number') }
  if (!numeric) return null
  const sessionId = relativeFile.replace(/^.*rollout-/, '').replace(/\.jsonl$/, '')
  const eventId = createHash('sha256').update(`${relativeFile}\0${byteOffset}\0${timestamp}`).digest('hex')
  return { ...event, eventId, sourceId: SOURCE_ID, sessionId, occurredAt: new Date(timestamp).toISOString(), relativeFile, byteOffset, parserVersion: PARSER_VERSION, model: modelName(model) ?? UNKNOWN_MODEL }
}

function modelBefore(content: Buffer, cursor: number): string {
  let position = 0; let model = UNKNOWN_MODEL
  while (position < cursor) {
    const end = content.indexOf(10, position)
    if (end < 0 || end >= cursor) break
    const line = content.subarray(position, end).toString('utf8').trim(); position = end + 1
    if (!line) continue
    try { model = extractModel(line) ?? model } catch { /* malformed context is ignored */ }
  }
  return model
}

export function scanFile(db: TokenDatabase, root: string, file: string, warnings: Warning[]): number {
  const relativeFile = relative(root, file).replaceAll('\\', '/')
  const content = readFileSync(file)
  let cursor = db.getCursor(SOURCE_ID, relativeFile)
  if (cursor > content.length) cursor = 0
  let model = modelBefore(content, cursor)
  let position = cursor; const events: UsageEvent[] = []
  while (position < content.length) {
    const end = content.indexOf(10, position)
    if (end < 0) break
    const line = content.subarray(position, end).toString('utf8').trim()
    const offset = position; position = end + 1
    if (!line) continue
    try { model = extractModel(line) ?? model; const event = extractEvent(line, relativeFile, offset, model); if (event) events.push(event) }
    catch { if (warnings.length < MAX_WARNINGS) warnings.push({ message: 'Skipped malformed or invalid Codex usage record.', count: 1 }) }
  }
  return db.writeFile(SOURCE_ID, relativeFile, position, events)
}

function rolloutFiles(root: string): string[] {
  const output: string[] = []
  const visit = (directory: string): void => { for (const name of readdirSync(directory)) { const file = join(directory, name); const stat = lstatSync(file); if (stat.isSymbolicLink()) continue; if (stat.isDirectory()) visit(file); else if (stat.isFile() && /^rollout-.*\.jsonl$/.test(name)) output.push(file) } }
  try { visit(root) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  return output.sort()
}
export function scanCodex(db: TokenDatabase, sessionsRoot: string): { files: number; events: number; warnings: Warning[] } {
  const warnings: Warning[] = []; let events = 0; const files = rolloutFiles(sessionsRoot)
  for (const file of files) events += scanFile(db, sessionsRoot, file, warnings)
  return { files: files.length, events, warnings }
}
export { PARSER_VERSION, SOURCE_ID, UNKNOWN_MODEL }
