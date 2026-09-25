import { createHash } from 'node:crypto'
import { lstatSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import type Database from 'better-sqlite3'
import type { Warning } from '../shared/contracts'
import type { IngestionStore, ProviderMigration, SourceDefinition, UsageEvent } from './ingestion/contracts'
import type { ProviderModule } from './providers/contracts'
import { sourceRoot } from './providers/discovery'

const SOURCE_ID = 'claude-current-user'
const PARSER_VERSION = 'claude-jsonl-v4'
const SOURCE_DEFINITION: SourceDefinition = { sourceId: SOURCE_ID, providerId: 'claude', label: 'Claude Code', kind: 'claude' }
const MAX_WARNINGS = 20
type Json = Record<string, unknown>
const safeNumber = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
const text = (value: unknown, maximum = 200): string | null => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maximum ? value.trim() : null
const timestamp = (value: unknown): string | null => { const result = text(value); return result && !Number.isNaN(Date.parse(result)) ? new Date(result).toISOString() : null }
const keys = [['input_tokens', 'inputTokens'], ['output_tokens', 'outputTokens'], ['cache_read_input_tokens', 'cachedInputTokens'], ['cache_creation_input_tokens', 'cacheWriteInputTokens']] as const

export function extractClaudeEvent(line: string, relativeFile: string, byteOffset: number): UsageEvent | null {
  const record = JSON.parse(line) as Json; const message = record.message as Json | undefined; const usage = message?.usage as Json | undefined
  const sessionId = text(record.session_id) ?? text(record.sessionId); const occurredAt = timestamp(record.timestamp); const model = text(message?.model, 100)
  if (record.type !== 'assistant' || !sessionId || !occurredAt || message?.role !== 'assistant' || !model || !usage) return null
  const messageId = text(message.id) ?? text(record.uuid)
  if (!messageId) return null
  const values = { inputTokens: null, outputTokens: null, cachedInputTokens: null, cacheWriteInputTokens: null, reasoningOutputTokens: null, totalTokens: null } as Pick<UsageEvent, 'inputTokens' | 'outputTokens' | 'cachedInputTokens' | 'cacheWriteInputTokens' | 'reasoningOutputTokens' | 'totalTokens'>
  let total = 0; let found = false
  for (const [source, target] of keys) { const value = safeNumber(usage[source]); if (value !== null) { values[target] = value; total += value; found = true } else if (usage[source] !== undefined) throw new Error('invalid token number') }
  let cacheWriteOneHourInputTokens: number | null = null
  const cacheCreation = usage.cache_creation
  if (typeof cacheCreation === 'object' && cacheCreation !== null && !Array.isArray(cacheCreation)) {
    const details = cacheCreation as Json
    const hasBreakdown = details.ephemeral_5m_input_tokens !== undefined || details.ephemeral_1h_input_tokens !== undefined
    const fiveMinute = details.ephemeral_5m_input_tokens === undefined ? 0 : safeNumber(details.ephemeral_5m_input_tokens)
    const oneHour = details.ephemeral_1h_input_tokens === undefined ? 0 : safeNumber(details.ephemeral_1h_input_tokens)
    if (hasBreakdown) {
      if (fiveMinute === null || oneHour === null) throw new Error('invalid Claude cache creation breakdown')
      const detailedTotal = fiveMinute + oneHour
      if (!Number.isSafeInteger(detailedTotal)) throw new Error('invalid Claude cache creation breakdown')
      if (values.cacheWriteInputTokens === null) { values.cacheWriteInputTokens = detailedTotal; total += detailedTotal; found = true }
      if (values.cacheWriteInputTokens !== detailedTotal) throw new Error('inconsistent Claude cache creation breakdown')
      cacheWriteOneHourInputTokens = oneHour
    }
  }
  if (!found) return null
  if (values.inputTokens !== null) values.inputTokens += (values.cachedInputTokens ?? 0) + (values.cacheWriteInputTokens ?? 0)
  return { ...values, cacheWriteOneHourInputTokens, totalTokens: total, eventId: createHash('sha256').update(`claude\0${sessionId}\0${messageId}`).digest('hex'), sourceId: SOURCE_ID, sessionId, occurredAt, relativeFile, byteOffset, parserVersion: PARSER_VERSION, model }
}

export function opaqueClaudeFileId(relativeFile: string): string {
  return createHash('sha256').update(`claude-file\0${relativeFile}`).digest('hex')
}

function files(root: string): string[] { const output: string[] = []; const visit = (directory: string): void => { for (const name of readdirSync(directory)) { const file = join(directory, name); const stat = lstatSync(file); if (stat.isSymbolicLink()) continue; if (stat.isDirectory()) visit(file); else if (stat.isFile() && name.endsWith('.jsonl')) output.push(file) } }; try { visit(root) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }; return output.sort() }
export function scanClaudeFile(db: IngestionStore, root: string, file: string, warnings: Warning[]): number { const fileId = opaqueClaudeFileId(relative(root, file).replaceAll('\\', '/')); const content = readFileSync(file); let cursor = db.getCursor(SOURCE_ID, fileId); if (cursor > content.length) cursor = 0; let position = cursor; const events: UsageEvent[] = []; while (position < content.length) { const end = content.indexOf(10, position); if (end < 0) break; const offset = position; const line = content.subarray(position, end).toString('utf8').trim(); position = end + 1; if (!line) continue; try { const event = extractClaudeEvent(line, fileId, offset); if (event) events.push(event) } catch { if (warnings.length < MAX_WARNINGS) warnings.push({ message: 'Skipped malformed or invalid Claude usage record.', count: 1 }) } } return db.writeFile(SOURCE_ID, fileId, position, events, true) }
export function scanClaude(db: IngestionStore, projectsRoot: string): { files: number; events: number; warnings: Warning[] } { const warnings: Warning[] = []; const found = files(projectsRoot); return { files: found.length, events: found.reduce((count, file) => count + scanClaudeFile(db, projectsRoot, file, warnings), 0), warnings } }

export function migrateLegacyClaudeFiles(database: Database.Database): void {
  const isOpaqueFileId = (value: string): boolean => /^[a-f0-9]{64}$/.test(value)
  const cursorRows = database.prepare('SELECT relative_file,byte_offset FROM source_cursors WHERE source_id=?').all(SOURCE_ID) as Array<{ relative_file: string; byte_offset: number }>
  for (const row of cursorRows) {
    if (isOpaqueFileId(row.relative_file)) continue
    const fileId = opaqueClaudeFileId(row.relative_file)
    database.prepare('INSERT INTO source_cursors(source_id,relative_file,byte_offset) VALUES(?,?,?) ON CONFLICT(source_id,relative_file) DO UPDATE SET byte_offset=max(byte_offset,excluded.byte_offset)').run(SOURCE_ID, fileId, row.byte_offset)
    database.prepare('DELETE FROM source_cursors WHERE source_id=? AND relative_file=?').run(SOURCE_ID, row.relative_file)
  }
  const eventRows = database.prepare('SELECT event_id,relative_file FROM usage_events WHERE source_id=?').all(SOURCE_ID) as Array<{ event_id: string; relative_file: string }>
  for (const row of eventRows) if (!isOpaqueFileId(row.relative_file)) database.prepare('UPDATE usage_events SET relative_file=? WHERE event_id=?').run(opaqueClaudeFileId(row.relative_file), row.event_id)
}

export const claudeLegacyFileMigration: ProviderMigration = { id: 'claude-file-identifiers', version: 1, migrate: migrateLegacyClaudeFiles }

export const claudeProvider: ProviderModule = {
  id: 'claude',
  definition: SOURCE_DEFINITION,
  discover: ({ home, env }) => {
    const configRoot = sourceRoot(env.CLAUDE_CONFIG_DIR, join(home, '.claude'))
    return [{ ...SOURCE_DEFINITION, parserVersion: PARSER_VERSION, root: join(configRoot, 'projects'), scan: scanClaude }]
  },
  migrations: [claudeLegacyFileMigration]
}
export { PARSER_VERSION, SOURCE_ID }
