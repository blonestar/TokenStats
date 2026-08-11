import { createHash } from 'node:crypto'
import { closeSync, lstatSync, openSync, readSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { Warning } from '../shared/contracts'
import type { IngestionStore, SourceDefinition, UsageEvent } from './ingestion/contracts'
import type { ProviderModule } from './providers/contracts'

const SOURCE_ID = 'codex-current-user'
const PARSER_VERSION = 'codex-jsonl-v2'
const SOURCE_DEFINITION: SourceDefinition = { sourceId: SOURCE_ID, providerId: 'codex', label: 'Codex', kind: 'codex' }
const MAX_WARNINGS = 20
const READ_CHUNK_BYTES = 64 * 1024
const WRITE_BATCH_SIZE = 500
const UNKNOWN_MODEL = 'Unknown'
type Json = Record<string, unknown>
type CodexLine = { line: string; offset: number; nextOffset: number }
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

function* readLines(file: string): Generator<CodexLine> {
  const descriptor = openSync(file, 'r')
  const chunk = Buffer.allocUnsafe(READ_CHUNK_BYTES)
  let readOffset = 0
  let pending = Buffer.alloc(0)
  let pendingOffset = 0
  try {
    while (true) {
      const bytesRead = readSync(descriptor, chunk, 0, chunk.length, readOffset)
      if (bytesRead === 0) break
      const chunkData = chunk.subarray(0, bytesRead)
      const merged = pending.length > 0 ? Buffer.concat([pending, chunkData]) : chunkData
      let lineStart = 0
      while (true) {
        const newline = merged.indexOf(10, lineStart)
        if (newline < 0) break
        const offset = pendingOffset + lineStart
        yield { line: merged.subarray(lineStart, newline).toString('utf8').trim(), offset, nextOffset: pendingOffset + newline + 1 }
        lineStart = newline + 1
      }
      if (lineStart < merged.length) {
        pending = Buffer.from(merged.subarray(lineStart))
        pendingOffset += lineStart
      } else {
        pending = Buffer.alloc(0)
        pendingOffset = readOffset + bytesRead
      }
      readOffset += bytesRead
    }
  } finally {
    closeSync(descriptor)
  }
}

export function scanFile(db: IngestionStore, root: string, file: string, warnings: Warning[]): number {
  const relativeFile = relative(root, file).replaceAll('\\', '/')
  const fileSize = statSync(file).size
  let cursor = db.getCursor(SOURCE_ID, relativeFile)
  if (cursor === fileSize) return 0
  if (cursor > fileSize) cursor = 0
  let model = UNKNOWN_MODEL
  let position = 0
  let imported = 0
  let events: UsageEvent[] = []
  for (const record of readLines(file)) {
    position = record.nextOffset
    if (record.offset < cursor) {
      if (record.line.includes('turn_context')) {
        try { model = extractModel(record.line) ?? model } catch { /* malformed context is ignored */ }
      }
      continue
    }
    if (!record.line) continue
    try {
      if (record.line.includes('turn_context')) model = extractModel(record.line) ?? model
      if (!record.line.includes('event_msg')) continue
      const event = extractEvent(record.line, relativeFile, record.offset, model)
      if (event) events.push(event)
      if (events.length >= WRITE_BATCH_SIZE) {
        imported += db.writeFile(SOURCE_ID, relativeFile, position, events)
        events = []
      }
    } catch {
      if (warnings.length < MAX_WARNINGS) warnings.push({ message: 'Skipped malformed or invalid Codex usage record.', count: 1 })
    }
  }
  imported += db.writeFile(SOURCE_ID, relativeFile, position, events)
  return imported
}

function rolloutFiles(root: string): string[] {
  const output: string[] = []
  const visit = (directory: string): void => { for (const name of readdirSync(directory)) { const file = join(directory, name); const stat = lstatSync(file); if (stat.isSymbolicLink()) continue; if (stat.isDirectory()) visit(file); else if (stat.isFile() && /^rollout-.*\.jsonl$/.test(name)) output.push(file) } }
  try { visit(root) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  return output.sort()
}
export function scanCodex(db: IngestionStore, sessionsRoot: string): { files: number; events: number; warnings: Warning[] } {
  const warnings: Warning[] = []; let events = 0; const files = rolloutFiles(sessionsRoot)
  for (const file of files) events += scanFile(db, sessionsRoot, file, warnings)
  return { files: files.length, events, warnings }
}
export const codexProvider: ProviderModule = {
  id: 'codex',
  definition: SOURCE_DEFINITION,
  discover: ({ home }) => [{ ...SOURCE_DEFINITION, parserVersion: PARSER_VERSION, root: join(home, '.codex', 'sessions'), scan: scanCodex }]
}

export { PARSER_VERSION, SOURCE_ID, UNKNOWN_MODEL }
