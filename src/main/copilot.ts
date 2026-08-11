import { createHash } from 'node:crypto'
import { lstatSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { Warning } from '../shared/contracts'
import type { TokenDatabase, UsageEvent } from './database'

const SOURCE_ID = 'copilot-current-user'
const PARSER_VERSION = 'copilot-events-v1'
const MAX_WARNINGS = 20
type Json = Record<string, unknown>
const safeNumber = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
const text = (value: unknown, maximum = 200): string | null => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maximum ? value.trim() : null
const timestamp = (value: unknown): string | null => { const result = text(value); return result && !Number.isNaN(Date.parse(result)) ? new Date(result).toISOString() : null }
const sessionName = (value: string | undefined): string | null => value && /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(value) ? value : null
const keys = [['inputTokens', 'inputTokens'], ['outputTokens', 'outputTokens'], ['cacheReadTokens', 'cachedInputTokens'], ['cacheWriteTokens', 'cacheWriteInputTokens'], ['reasoningTokens', 'reasoningOutputTokens']] as const

export function extractCopilotSnapshot(line: string, relativeFile: string, sessionId: string, byteOffset: number): UsageEvent[] | null {
  const record = JSON.parse(line) as Json; const data = record.data as Json | undefined; const metrics = data?.modelMetrics as Json | undefined; const occurredAt = timestamp(record.timestamp)
  if (record.type !== 'session.shutdown' || !text(record.id) || !occurredAt || !metrics) return null
  const events: UsageEvent[] = []
  for (const [modelValue, metricValue] of Object.entries(metrics)) { const model = text(modelValue, 100); const metric = metricValue as Json; const usage = metric?.usage as Json | undefined; if (!model || !usage || typeof metricValue !== 'object' || metricValue === null) continue; const values = { inputTokens: null, outputTokens: null, cachedInputTokens: null, cacheWriteInputTokens: null, reasoningOutputTokens: null, totalTokens: null } as Pick<UsageEvent, 'inputTokens' | 'outputTokens' | 'cachedInputTokens' | 'cacheWriteInputTokens' | 'reasoningOutputTokens' | 'totalTokens'>; let total = 0; let found = false; for (const [source, target] of keys) { const value = safeNumber(usage[source]); if (value !== null) { values[target] = value; total += value; found = true } else if (usage[source] !== undefined) throw new Error('invalid token number') } if (found) events.push({ ...values, totalTokens: total, eventId: createHash('sha256').update(`copilot\0${sessionId}\0${model}`).digest('hex'), sourceId: SOURCE_ID, sessionId, occurredAt, relativeFile, byteOffset, parserVersion: PARSER_VERSION, model }) }
  return events.length ? events : null
}
function files(root: string): string[] { const output: string[] = []; const visit = (directory: string): void => { for (const name of readdirSync(directory)) { const file = join(directory, name); const stat = lstatSync(file); if (stat.isSymbolicLink()) continue; if (stat.isDirectory()) visit(file); else if (stat.isFile() && name === 'events.jsonl') output.push(file) } }; try { visit(root) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }; return output.sort() }
export function scanCopilotFile(db: TokenDatabase, root: string, file: string, warnings: Warning[]): number { const relativeFile = relative(root, file).replaceAll('\\', '/'); const sessionId = sessionName(relativeFile.split('/')[0]); if (!sessionId) return 0; const content = readFileSync(file); const previous = db.getCursor(SOURCE_ID, relativeFile); if (previous === content.length) return 0; let position = 0; let latest: UsageEvent[] | null = null; while (position < content.length) { const end = content.indexOf(10, position); if (end < 0) break; const offset = position; const line = content.subarray(position, end).toString('utf8').trim(); position = end + 1; if (!line) continue; try { const snapshot = extractCopilotSnapshot(line, relativeFile, sessionId, offset); if (snapshot) latest = snapshot } catch { if (warnings.length < MAX_WARNINGS) warnings.push({ message: 'Skipped malformed or invalid Copilot usage record.', count: 1 }) } } return latest ? db.reconcileSnapshot(SOURCE_ID, relativeFile, position, latest) : db.writeFile(SOURCE_ID, relativeFile, position, []) }
export function scanCopilot(db: TokenDatabase, sessionStateRoot: string): { files: number; events: number; warnings: Warning[] } { const warnings: Warning[] = []; const found = files(sessionStateRoot); return { files: found.length, events: found.reduce((count, file) => count + scanCopilotFile(db, sessionStateRoot, file, warnings), 0), warnings } }
export { PARSER_VERSION, SOURCE_ID }
