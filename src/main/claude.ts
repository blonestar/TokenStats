import { createHash } from 'node:crypto'
import { lstatSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { Warning } from '../shared/contracts'
import type { TokenDatabase, UsageEvent } from './database'

const SOURCE_ID = 'claude-current-user'
const PARSER_VERSION = 'claude-jsonl-v2'
const MAX_WARNINGS = 20
type Json = Record<string, unknown>
const safeNumber = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
const text = (value: unknown, maximum = 200): string | null => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maximum ? value.trim() : null
const timestamp = (value: unknown): string | null => { const result = text(value); return result && !Number.isNaN(Date.parse(result)) ? new Date(result).toISOString() : null }
const keys = [['input_tokens', 'inputTokens'], ['output_tokens', 'outputTokens'], ['cache_read_input_tokens', 'cachedInputTokens'], ['cache_creation_input_tokens', 'cacheWriteInputTokens']] as const

export function extractClaudeEvent(line: string, relativeFile: string, byteOffset: number): UsageEvent | null {
  const record = JSON.parse(line) as Json; const message = record.message as Json | undefined; const usage = message?.usage as Json | undefined
  const sessionId = text(record.session_id); const occurredAt = timestamp(record.timestamp); const model = text(message?.model, 100)
  if (record.type !== 'assistant' || !sessionId || !occurredAt || message?.role !== 'assistant' || !model || !usage) return null
  const messageId = text(message.id) ?? text(record.uuid)
  if (!messageId) return null
  const values = { inputTokens: null, outputTokens: null, cachedInputTokens: null, cacheWriteInputTokens: null, reasoningOutputTokens: null, totalTokens: null } as Pick<UsageEvent, 'inputTokens' | 'outputTokens' | 'cachedInputTokens' | 'cacheWriteInputTokens' | 'reasoningOutputTokens' | 'totalTokens'>
  let total = 0; let found = false
  for (const [source, target] of keys) { const value = safeNumber(usage[source]); if (value !== null) { values[target] = value; total += value; found = true } else if (usage[source] !== undefined) throw new Error('invalid token number') }
  if (!found) return null
  return { ...values, totalTokens: total, eventId: createHash('sha256').update(`claude\0${sessionId}\0${messageId}`).digest('hex'), sourceId: SOURCE_ID, sessionId, occurredAt, relativeFile, byteOffset, parserVersion: PARSER_VERSION, model }
}

export function opaqueClaudeFileId(relativeFile: string): string {
  return createHash('sha256').update(`claude-file\0${relativeFile}`).digest('hex')
}

function files(root: string): string[] { const output: string[] = []; const visit = (directory: string): void => { for (const name of readdirSync(directory)) { const file = join(directory, name); const stat = lstatSync(file); if (stat.isSymbolicLink()) continue; if (stat.isDirectory()) visit(file); else if (stat.isFile() && name.endsWith('.jsonl')) output.push(file) } }; try { visit(root) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }; return output.sort() }
export function scanClaudeFile(db: TokenDatabase, root: string, file: string, warnings: Warning[]): number { const fileId = opaqueClaudeFileId(relative(root, file).replaceAll('\\', '/')); const content = readFileSync(file); let cursor = db.getCursor(SOURCE_ID, fileId); if (cursor > content.length) cursor = 0; let position = cursor; const events: UsageEvent[] = []; while (position < content.length) { const end = content.indexOf(10, position); if (end < 0) break; const offset = position; const line = content.subarray(position, end).toString('utf8').trim(); position = end + 1; if (!line) continue; try { const event = extractClaudeEvent(line, fileId, offset); if (event) events.push(event) } catch { if (warnings.length < MAX_WARNINGS) warnings.push({ message: 'Skipped malformed or invalid Claude usage record.', count: 1 }) } } return db.writeFile(SOURCE_ID, fileId, position, events, true) }
export function scanClaude(db: TokenDatabase, projectsRoot: string): { files: number; events: number; warnings: Warning[] } { const warnings: Warning[] = []; const found = files(projectsRoot); return { files: found.length, events: found.reduce((count, file) => count + scanClaudeFile(db, projectsRoot, file, warnings), 0), warnings } }
export { PARSER_VERSION, SOURCE_ID }
