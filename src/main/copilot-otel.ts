import { createHash } from 'node:crypto'
import { lstatSync, readFileSync } from 'node:fs'
import type { SourceStatus, Warning } from '../shared/contracts'
import type { TokenDatabase, UsageEvent } from './database'

export const OTEL_RELATIVE_FILE = 'otel/tokenstats.jsonl'
const SOURCE_ID = 'copilot-current-user'
const PARSER_VERSION = 'copilot-events-v3-otel'
const MAX_WARNINGS = 20
type Json = Record<string, unknown>
export type OTelScanResult = { files: number; events: number; warnings: Warning[]; status: SourceStatus; completeSpans: number; fallbackRemoved: number }

const text = (value: unknown, maximum = 200): string | null => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maximum && !/[\u0000\r\n]/.test(value) ? value.trim() : null
const identifier = (value: unknown): string | null => { const result = text(value); return result && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(result) ? result : null }
const modelIdentifier = (value: unknown): string | null => { const result = text(value, 100); return result && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(result) ? result : null }
const object = (value: unknown): Json | undefined => typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Json : undefined
const unwrap = (value: unknown): unknown => { const record = object(value); return record && 'value' in record ? record.value : value }

function safeNumber(value: unknown): number | null {
  const unwrapped = unwrap(value)
  if (typeof unwrapped === 'number' && Number.isSafeInteger(unwrapped) && unwrapped >= 0) return unwrapped
  if (typeof unwrapped === 'string' && /^\d+$/.test(unwrapped)) { const parsed = Number(unwrapped); return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null }
  return null
}

function attribute(attributes: Json, key: string): unknown { return attributes[key] }

function firstAttribute(attributes: Json, keys: readonly string[]): unknown {
  for (const key of keys) { const value = attribute(attributes, key); if (value !== undefined) return value }
  return undefined
}

function numericAttribute(attributes: Json, key: string): number | null {
  const value = attribute(attributes, key)
  if (value === undefined) return null
  const result = safeNumber(value)
  if (result === null) throw new Error(`invalid OTel token number: ${key}`)
  return result
}

function isoTimestamp(value: unknown): string | null {
  const unwrapped = unwrap(value)
  if (typeof unwrapped === 'string') { const parsed = Date.parse(unwrapped); if (!Number.isNaN(parsed)) return new Date(parsed).toISOString() }
  if (typeof unwrapped === 'number' && Number.isFinite(unwrapped)) {
    const milliseconds = unwrapped >= 1e17 ? unwrapped / 1e6 : unwrapped >= 1e14 ? unwrapped / 1e3 : unwrapped >= 1e11 ? unwrapped : unwrapped * 1e3
    try { const result = new Date(milliseconds); if (!Number.isNaN(result.getTime())) return result.toISOString() } catch { return null }
  }
  if (Array.isArray(unwrapped) && unwrapped.length >= 2) {
    const seconds = safeNumber(unwrapped[0]); const nanos = safeNumber(unwrapped[1]);
    if (seconds !== null && nanos !== null) { try { const result = new Date(seconds * 1e3 + nanos / 1e6); if (!Number.isNaN(result.getTime())) return result.toISOString() } catch { return null } }
  }
  const record = object(unwrapped)
  if (record) {
    const seconds = safeNumber(record.seconds ?? record.sec)
    const nanos = safeNumber(record.nanos ?? record.nanoseconds ?? record.nano)
    if (seconds !== null && nanos !== null) { try { const result = new Date(seconds * 1e3 + nanos / 1e6); if (!Number.isNaN(result.getTime())) return result.toISOString() } catch { return null } }
  }
  return null
}

function eventFromSpan(record: Json, byteOffset: number): UsageEvent | null {
  if (record.type !== 'span') return null
  const attributes = object(record.attributes)
  if (!attributes) return null
  const operation = text(attribute(attributes, 'gen_ai.operation.name')) ?? text(record.name)
  if (operation !== 'chat') return null
  const model = modelIdentifier(firstAttribute(attributes, ['gen_ai.response.model', 'gen_ai.request.model']))
  const inputTokens = numericAttribute(attributes, 'gen_ai.usage.input_tokens')
  const outputTokens = numericAttribute(attributes, 'gen_ai.usage.output_tokens')
  if (!model || inputTokens === null || outputTokens === null) return null
  const cachedInputTokens = numericAttribute(attributes, 'gen_ai.usage.cache_read.input_tokens')
  const cacheWriteInputTokens = numericAttribute(attributes, 'gen_ai.usage.cache_creation.input_tokens')
  const reasoningOutputTokens = numericAttribute(attributes, 'gen_ai.usage.reasoning_tokens')
  if (cachedInputTokens !== null && cacheWriteInputTokens !== null && cachedInputTokens + cacheWriteInputTokens > inputTokens) throw new Error('invalid OTel cache token relationship')
  if (reasoningOutputTokens !== null && reasoningOutputTokens > outputTokens) throw new Error('invalid OTel reasoning token relationship')
  const occurredAt = isoTimestamp(record.endTime) ?? isoTimestamp(record.startTime) ?? isoTimestamp(record.timestamp)
  const spanId = identifier(record.spanId)
  const conversationId = identifier(firstAttribute(attributes, ['gen_ai.conversation.id', 'github.copilot.session_id', 'github.copilot.session.id', 'copilot_chat.chat_session_id']))
  const sessionId = conversationId
  const turnId = identifier(firstAttribute(attributes, ['github.copilot.turn_id', 'github.copilot.interaction_id', 'gen_ai.response.id'])) ?? spanId
  if (!occurredAt || !sessionId || !turnId) return null
  const totalTokens = inputTokens + outputTokens
  const event: UsageEvent = {
    inputTokens,
    outputTokens,
    cachedInputTokens,
    cacheWriteInputTokens,
    reasoningOutputTokens,
    totalTokens,
    eventId: createHash('sha256').update(`copilot-otel\0${sessionId}\0${turnId}\0${model}`).digest('hex'),
    sourceId: SOURCE_ID,
    sessionId,
    occurredAt,
    relativeFile: OTEL_RELATIVE_FILE,
    byteOffset,
    parserVersion: PARSER_VERSION,
    model
  }
  return event
}

export function extractCopilotOtelSpan(line: string, byteOffset = 0): UsageEvent | null {
  return eventFromSpan(JSON.parse(line) as Json, byteOffset)
}

const fileSignature = (stat: NonNullable<ReturnType<typeof lstatSync>>): string => JSON.stringify([stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs])
const emptyResult = (warnings: Warning[], status: SourceStatus): OTelScanResult => ({ files: 0, events: 0, warnings, status, completeSpans: 0, fallbackRemoved: 0 })

export function scanCopilotOtelFile(db: TokenDatabase, file: string, warnings: Warning[]): OTelScanResult {
  let stat: ReturnType<typeof lstatSync>
  try { stat = lstatSync(file) } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') { db.resetFileTracking(SOURCE_ID, OTEL_RELATIVE_FILE); db.deactivateCopilotOtel(SOURCE_ID, OTEL_RELATIVE_FILE); return emptyResult(warnings, 'session-state fallback') }
    throw error
  }
  if (!stat.isFile()) {
    if (warnings.length < MAX_WARNINGS) warnings.push({ message: 'Skipped Copilot OTel path because it is not a regular file.', count: 1 })
    db.resetFileTracking(SOURCE_ID, OTEL_RELATIVE_FILE)
    db.deactivateCopilotOtel(SOURCE_ID, OTEL_RELATIVE_FILE)
    return emptyResult(warnings, 'session-state fallback')
  }
  let content: Buffer
  try { content = readFileSync(file) } catch (error) { throw error }
  let cursor = db.getCursor(SOURCE_ID, OTEL_RELATIVE_FILE)
  const storedSignature = db.getFileSignature(SOURCE_ID, OTEL_RELATIVE_FILE)
  const rotated = cursor > content.length || (cursor > 0 && (storedSignature === null || storedSignature !== fileSignature(stat)))
  if (rotated) { db.resetFileTracking(SOURCE_ID, OTEL_RELATIVE_FILE); db.deactivateCopilotOtel(SOURCE_ID, OTEL_RELATIVE_FILE); cursor = 0 }
  let position = cursor
  const events: UsageEvent[] = []
  while (position < content.length) {
    const end = content.indexOf(10, position)
    if (end < 0) break
    const offset = position
    const line = content.subarray(position, end).toString('utf8').trim()
    position = end + 1
    if (!line) continue
    try {
      const parsed = eventFromSpan(JSON.parse(line) as Json, offset)
      if (!parsed) continue
      events.push(parsed)
    } catch {
      if (warnings.length < MAX_WARNINGS) warnings.push({ message: 'Skipped malformed or incomplete Copilot OTel record.', count: 1 })
    }
  }
  const imported = db.writeFile(SOURCE_ID, OTEL_RELATIVE_FILE, position, events, true)
  db.setFileSignature(SOURCE_ID, OTEL_RELATIVE_FILE, fileSignature(stat))
  const reconciliation = db.reconcileCopilotOtel(SOURCE_ID, OTEL_RELATIVE_FILE)
  const status: SourceStatus = reconciliation.activeEvents > 0 ? 'otel enabled' : 'otel file present'
  return { files: 1, events: imported, warnings, status, completeSpans: reconciliation.completeEvents, fallbackRemoved: reconciliation.removedFallback }
}

export { PARSER_VERSION, SOURCE_ID }
