import { createHash } from 'node:crypto'
import { lstatSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { SourceStatus, Warning } from '../shared/contracts'
import type { IngestionStore, SourceDefinition, UsageEvent } from './ingestion/contracts'
import type { ProviderModule } from './providers/contracts'
import { scanCopilotOtelFile } from './copilot-otel'
import { sourceRoot } from './providers/discovery'

const SOURCE_ID = 'copilot-current-user'
const PARSER_VERSION = 'copilot-events-v3-otel'
const SOURCE_DEFINITION: SourceDefinition = { sourceId: SOURCE_ID, providerId: 'copilot', label: 'GitHub Copilot', kind: 'copilot' }
const MAX_WARNINGS = 20
type Json = Record<string, unknown>
const safeNumber = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
const text = (value: unknown, maximum = 200): string | null => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maximum ? value.trim() : null
const timestamp = (value: unknown): string | null => { const result = text(value); return result && !Number.isNaN(Date.parse(result)) ? new Date(result).toISOString() : null }
const sessionName = (value: string | undefined): string | null => value && /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(value) ? value : null
const keys = [['inputTokens', 'inputTokens'], ['outputTokens', 'outputTokens'], ['cacheReadTokens', 'cachedInputTokens'], ['cacheWriteTokens', 'cacheWriteInputTokens'], ['reasoningTokens', 'reasoningOutputTokens']] as const
type UsageValues = Pick<UsageEvent, 'inputTokens' | 'outputTokens' | 'cachedInputTokens' | 'cacheWriteInputTokens' | 'reasoningOutputTokens' | 'totalTokens'>

function parseUsage(usage: Json): UsageValues | null {
  const values = { inputTokens: null, outputTokens: null, cachedInputTokens: null, cacheWriteInputTokens: null, reasoningOutputTokens: null, totalTokens: null } as UsageValues
  let found = false
  for (const [source, target] of keys) {
    const value = safeNumber(usage[source])
    if (value !== null) { values[target] = value; found = true }
    else if (usage[source] !== undefined) throw new Error('invalid token number')
  }
  const totalTokens = values.inputTokens !== null || values.outputTokens !== null ? (values.inputTokens ?? 0) + (values.outputTokens ?? 0) : null
  return found ? { ...values, totalTokens } : null
}

function eventFor(values: UsageValues, sessionId: string, relativeFile: string, occurredAt: string, model: string, byteOffset: number): UsageEvent {
  return { ...values, eventId: createHash('sha256').update(`copilot\0${sessionId}\0${model}`).digest('hex'), sourceId: SOURCE_ID, sessionId, occurredAt, relativeFile, byteOffset, parserVersion: PARSER_VERSION, model }
}

export function extractCopilotSnapshot(line: string, relativeFile: string, sessionId: string, byteOffset: number): UsageEvent[] | null {
  const record = JSON.parse(line) as Json; const data = record.data as Json | undefined; const metrics = data?.modelMetrics as Json | undefined; const occurredAt = timestamp(record.timestamp)
  if (record.type !== 'session.shutdown' || !text(record.id) || !occurredAt || !metrics) return null
  const events: UsageEvent[] = []
  for (const [modelValue, metricValue] of Object.entries(metrics)) { const model = text(modelValue, 100); const metric = metricValue as Json; const usage = metric?.usage as Json | undefined; if (!model || !usage || typeof metricValue !== 'object' || metricValue === null) continue; const values = parseUsage(usage); if (values) events.push(eventFor(values, sessionId, relativeFile, occurredAt, model, byteOffset)) }
  return events.length ? events : null
}

export function extractCopilotActiveMessage(line: string, relativeFile: string, sessionId: string, byteOffset: number): UsageEvent | null {
  const record = JSON.parse(line) as Json; const data = record.data as Json | undefined; const occurredAt = timestamp(record.timestamp); const model = text(data?.model, 100); const output = safeNumber(data?.outputTokens)
  if (record.type !== 'assistant.message' || !text(record.id) || !occurredAt || !model) return null
  if (data?.outputTokens !== undefined && output === null) throw new Error('invalid token number')
  if (output === null) return null
  return eventFor({ inputTokens: null, outputTokens: output, cachedInputTokens: null, cacheWriteInputTokens: null, reasoningOutputTokens: null, totalTokens: output }, sessionId, relativeFile, occurredAt, model, byteOffset)
}
function files(root: string): string[] { const output: string[] = []; const visit = (directory: string): void => { for (const name of readdirSync(directory)) { const file = join(directory, name); const stat = lstatSync(file); if (stat.isSymbolicLink()) continue; if (stat.isDirectory()) visit(file); else if (stat.isFile() && name === 'events.jsonl') output.push(file) } }; try { visit(root) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }; return output.sort() }
export function scanCopilotFile(db: IngestionStore, root: string, file: string, warnings: Warning[]): number { const relativeFile = relative(root, file).replaceAll('\\', '/'); const sessionId = sessionName(relativeFile.split('/')[0]); if (!sessionId) return 0; const content = readFileSync(file); let previous = db.getCursor(SOURCE_ID, relativeFile); if (previous > content.length) previous = 0; if (previous === content.length) { db.activateFile(SOURCE_ID, relativeFile); return 0 } let position = 0; let latest: UsageEvent[] | null = null; const active = new Map<string, UsageEvent>(); while (position < content.length) { const end = content.indexOf(10, position); if (end < 0) break; const offset = position; const line = content.subarray(position, end).toString('utf8').trim(); position = end + 1; if (!line) continue; try { const snapshot = extractCopilotSnapshot(line, relativeFile, sessionId, offset); if (snapshot) { latest = snapshot; active.clear(); continue } const message = extractCopilotActiveMessage(line, relativeFile, sessionId, offset); if (message) { const current = active.get(message.eventId); active.set(message.eventId, current ? { ...current, outputTokens: (current.outputTokens ?? 0) + (message.outputTokens ?? 0), totalTokens: (current.totalTokens ?? 0) + (message.totalTokens ?? 0), occurredAt: message.occurredAt, byteOffset: message.byteOffset } : message); latest = [...active.values()] } } catch { if (warnings.length < MAX_WARNINGS) warnings.push({ message: 'Skipped malformed or invalid Copilot usage record.', count: 1 }) } } return latest ? db.reconcileSnapshot(SOURCE_ID, relativeFile, position, latest) : db.writeFile(SOURCE_ID, relativeFile, position, []) }
export function scanCopilot(db: IngestionStore, sessionStateRoot: string, otelFile?: string): { files: number; events: number; warnings: Warning[]; status: SourceStatus } { const warnings: Warning[] = []; const found = files(sessionStateRoot); let events = found.reduce((count, file) => count + scanCopilotFile(db, sessionStateRoot, file, warnings), 0); const otel = otelFile ? scanCopilotOtelFile(db, otelFile, warnings) : { files: 0, events: 0, status: 'session-state fallback' as const, completeSpans: 0, fallbackRemoved: 0 }; events = Math.max(0, events + otel.events - otel.fallbackRemoved); return { files: found.length + otel.files, events, warnings, status: otel.files > 0 ? otel.status : found.length > 0 ? 'session-state fallback' : 'not found' } }

export const copilotProvider: ProviderModule = {
  id: 'copilot',
  definition: SOURCE_DEFINITION,
  discover: ({ home, env }) => {
    const copilotHome = sourceRoot(env.COPILOT_HOME, join(home, '.copilot'))
    const otelFile = sourceRoot(env.COPILOT_OTEL_FILE_EXPORTER_PATH, join(copilotHome, 'otel', 'tokenstats.jsonl'))
    return [{ ...SOURCE_DEFINITION, parserVersion: PARSER_VERSION, root: join(copilotHome, 'session-state'), scan: (store, root) => scanCopilot(store, root, otelFile) }]
  }
}
export { PARSER_VERSION, SOURCE_ID }
