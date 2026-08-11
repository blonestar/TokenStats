import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { SOURCE_ID as CODEX_SOURCE_ID } from './codex'
import { SOURCE_ID as CLAUDE_SOURCE_ID } from './claude'
import { SOURCE_ID as COPILOT_SOURCE_ID } from './copilot'
import { costKey, summarizeCosts, unknownCost } from './pricing'
import type { Dashboard, DashboardPeriod, DashboardRange, TokenUsage, Warning } from '../shared/contracts'

export type UsageEvent = TokenUsage & { eventId: string; sourceId: string; sessionId: string; occurredAt: string; relativeFile: string; byteOffset: number; parserVersion: string; model: string }
const periods: DashboardPeriod[] = ['today', 'yesterday', 'thisWeek', 'lastWeek', 'thisMonth', 'lastMonth', 'last6Months']
const validPeriod = (value: unknown): DashboardPeriod => periods.includes(value as DashboardPeriod) ? value as DashboardPeriod : 'thisMonth'
const localDate = (date: Date): string => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const startOfDay = (date: Date): Date => { const value = new Date(date); value.setHours(0, 0, 0, 0); return value }
const startOfWeek = (date: Date): Date => { const value = startOfDay(date); const daysFromMonday = (value.getDay() + 6) % 7; value.setDate(value.getDate() - daysFromMonday); return value }

function rangeFor(periodInput: unknown, now: Date): { period: DashboardPeriod; range: DashboardRange } {
  const period = validPeriod(periodInput); const today = startOfDay(now); let start: Date; let end: Date
  if (period === 'today') { start = today; end = new Date(start); end.setDate(end.getDate() + 1) }
  else if (period === 'yesterday') { end = today; start = new Date(end); start.setDate(start.getDate() - 1) }
  else if (period === 'thisWeek') { start = startOfWeek(today); end = new Date(start); end.setDate(end.getDate() + 7) }
  else if (period === 'lastWeek') { end = startOfWeek(today); start = new Date(end); start.setDate(start.getDate() - 7) }
  else if (period === 'thisMonth') { start = new Date(today); start.setDate(1); end = new Date(start); end.setMonth(end.getMonth() + 1) }
  else if (period === 'lastMonth') { end = new Date(today); end.setDate(1); start = new Date(end); start.setMonth(start.getMonth() - 1) }
  else { end = new Date(today); end.setDate(1); end.setMonth(end.getMonth() + 1); start = new Date(end); start.setMonth(start.getMonth() - 6) }
  const endLabel = new Date(end); endLabel.setDate(endLabel.getDate() - 1)
  return { period, range: { start: start.toISOString(), end: end.toISOString(), startLabel: localDate(start), endLabel: localDate(endLabel), label: period === 'today' ? localDate(start) : `${localDate(start)} to ${localDate(endLabel)}` } }
}

export class TokenDatabase {
  readonly db: Database.Database
  constructor(file: string) { mkdirSync(dirname(file), { recursive: true }); this.db = new Database(file); this.migrate() }
  private migrate(): void {
    this.db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY, kind TEXT NOT NULL, status TEXT NOT NULL, parser_version TEXT NOT NULL, last_successful_scan TEXT);
CREATE TABLE IF NOT EXISTS source_cursors (source_id TEXT NOT NULL, relative_file TEXT NOT NULL, byte_offset INTEGER NOT NULL, PRIMARY KEY(source_id, relative_file));
CREATE TABLE IF NOT EXISTS scan_runs (id INTEGER PRIMARY KEY, source_id TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT, status TEXT NOT NULL, files_scanned INTEGER NOT NULL DEFAULT 0, events_imported INTEGER NOT NULL DEFAULT 0, warning_count INTEGER NOT NULL DEFAULT 0, warnings_json TEXT NOT NULL DEFAULT '[]');
CREATE TABLE IF NOT EXISTS usage_events (event_id TEXT PRIMARY KEY, source_id TEXT NOT NULL, session_id TEXT NOT NULL, occurred_at TEXT NOT NULL, input_tokens INTEGER, output_tokens INTEGER, cached_input_tokens INTEGER, cache_write_input_tokens INTEGER, reasoning_output_tokens INTEGER, total_tokens INTEGER, relative_file TEXT NOT NULL, byte_offset INTEGER NOT NULL, parser_version TEXT NOT NULL, inserted_at TEXT NOT NULL);
INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(1, datetime('now'));`)
    const hasV2 = this.db.prepare('SELECT 1 FROM schema_migrations WHERE version=2').get()
    if (!hasV2) this.db.transaction(() => { this.db.exec('ALTER TABLE usage_events ADD COLUMN model TEXT'); this.db.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES(2, datetime('now'))").run() })()
    const hasV3 = this.db.prepare('SELECT 1 FROM schema_migrations WHERE version=3').get()
    if (!hasV3) this.db.transaction(() => {
      const opaque = (value: string): string => createHash('sha256').update(`claude-file\0${value}`).digest('hex')
      const cursorRows = this.db.prepare('SELECT relative_file,byte_offset FROM source_cursors WHERE source_id=?').all(CLAUDE_SOURCE_ID) as Array<{ relative_file: string; byte_offset: number }>
      for (const row of cursorRows) { const fileId = opaque(row.relative_file); this.db.prepare('INSERT INTO source_cursors(source_id,relative_file,byte_offset) VALUES(?,?,?) ON CONFLICT(source_id,relative_file) DO UPDATE SET byte_offset=max(byte_offset,excluded.byte_offset)').run(CLAUDE_SOURCE_ID, fileId, row.byte_offset); this.db.prepare('DELETE FROM source_cursors WHERE source_id=? AND relative_file=?').run(CLAUDE_SOURCE_ID, row.relative_file) }
      const eventRows = this.db.prepare('SELECT event_id,relative_file FROM usage_events WHERE source_id=?').all(CLAUDE_SOURCE_ID) as Array<{ event_id: string; relative_file: string }>
      for (const row of eventRows) this.db.prepare('UPDATE usage_events SET relative_file=? WHERE event_id=?').run(opaque(row.relative_file), row.event_id)
      this.db.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES(3, datetime('now'))").run()
    })()
  }
  getCursor(sourceId: string, relativeFile: string): number { return this.db.prepare('SELECT byte_offset FROM source_cursors WHERE source_id=? AND relative_file=?').pluck().get(sourceId, relativeFile) as number | undefined ?? 0 }
  writeFile(sourceId: string, relativeFile: string, cursor: number, events: UsageEvent[], updateExisting = false): number {
    const insert = this.db.prepare(`INSERT OR IGNORE INTO usage_events (event_id,source_id,session_id,occurred_at,input_tokens,output_tokens,cached_input_tokens,cache_write_input_tokens,reasoning_output_tokens,total_tokens,relative_file,byte_offset,parser_version,inserted_at,model) VALUES (@eventId,@sourceId,@sessionId,@occurredAt,@inputTokens,@outputTokens,@cachedInputTokens,@cacheWriteInputTokens,@reasoningOutputTokens,@totalTokens,@relativeFile,@byteOffset,@parserVersion,@insertedAt,@model)`)
    const backfill = this.db.prepare("UPDATE usage_events SET model=? WHERE event_id=? AND (model IS NULL OR model='Unknown') AND ? <> 'Unknown'")
    const update = this.db.prepare('UPDATE usage_events SET source_id=@sourceId,session_id=@sessionId,occurred_at=@occurredAt,input_tokens=@inputTokens,output_tokens=@outputTokens,cached_input_tokens=@cachedInputTokens,cache_write_input_tokens=@cacheWriteInputTokens,reasoning_output_tokens=@reasoningOutputTokens,total_tokens=@totalTokens,relative_file=@relativeFile,byte_offset=@byteOffset,parser_version=@parserVersion,model=@model WHERE event_id=@eventId')
    const write = this.db.transaction(() => { let inserted = 0; for (const event of events) { const values = { ...event, insertedAt: new Date().toISOString() }; const changed = insert.run(values).changes; inserted += changed; if (changed === 0 && updateExisting) update.run(values); else backfill.run(event.model, event.eventId, event.model) } this.db.prepare('INSERT INTO source_cursors VALUES(?,?,?) ON CONFLICT(source_id,relative_file) DO UPDATE SET byte_offset=excluded.byte_offset').run(sourceId, relativeFile, cursor); return inserted })
    return write()
  }
  reconcileSnapshot(sourceId: string, relativeFile: string, cursor: number, events: UsageEvent[]): number {
    if (events.length === 0) return this.writeFile(sourceId, relativeFile, cursor, [])
    const insert = this.db.prepare(`INSERT OR IGNORE INTO usage_events (event_id,source_id,session_id,occurred_at,input_tokens,output_tokens,cached_input_tokens,cache_write_input_tokens,reasoning_output_tokens,total_tokens,relative_file,byte_offset,parser_version,inserted_at,model) VALUES (@eventId,@sourceId,@sessionId,@occurredAt,@inputTokens,@outputTokens,@cachedInputTokens,@cacheWriteInputTokens,@reasoningOutputTokens,@totalTokens,@relativeFile,@byteOffset,@parserVersion,@insertedAt,@model)`)
    const update = this.db.prepare('UPDATE usage_events SET source_id=@sourceId,session_id=@sessionId,occurred_at=@occurredAt,input_tokens=@inputTokens,output_tokens=@outputTokens,cached_input_tokens=@cachedInputTokens,cache_write_input_tokens=@cacheWriteInputTokens,reasoning_output_tokens=@reasoningOutputTokens,total_tokens=@totalTokens,relative_file=@relativeFile,byte_offset=@byteOffset,parser_version=@parserVersion,model=@model WHERE event_id=@eventId')
    const ids = events.map((event) => event.eventId)
    const stale = this.db.prepare(`DELETE FROM usage_events WHERE source_id=? AND relative_file=? AND session_id=? AND event_id NOT IN (${ids.map(() => '?').join(',')})`)
    return this.db.transaction(() => { let inserted = 0; for (const event of events) { const values = { ...event, insertedAt: new Date().toISOString() }; const changed = insert.run(values).changes; inserted += changed; if (changed === 0) update.run(values) } stale.run(sourceId, relativeFile, events[0].sessionId, ...ids); this.db.prepare('INSERT INTO source_cursors VALUES(?,?,?) ON CONFLICT(source_id,relative_file) DO UPDATE SET byte_offset=excluded.byte_offset').run(sourceId, relativeFile, cursor); return inserted })()
  }
  beginScan(sourceId: string, kind: string, parserVersion: string): number {
    const source = this.db.prepare('SELECT parser_version FROM sources WHERE id=?').get(sourceId) as { parser_version: string } | undefined
    const begin = this.db.transaction(() => { if (source && source.parser_version !== parserVersion) this.db.prepare('DELETE FROM source_cursors WHERE source_id=?').run(sourceId); this.db.prepare("INSERT INTO sources(id,kind,status,parser_version,last_successful_scan) VALUES(?,?, 'scanning', ?, NULL) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,status='scanning',parser_version=excluded.parser_version").run(sourceId, kind, parserVersion); return Number(this.db.prepare("INSERT INTO scan_runs(source_id,started_at,status) VALUES(?,?,'running')").run(sourceId, new Date().toISOString()).lastInsertRowid) })
    return begin()
  }
  finishScan(id: number, sourceId: string, result: { files: number; events: number; warnings: Warning[]; ok: boolean }): void { const now = new Date().toISOString(); this.db.prepare('UPDATE scan_runs SET finished_at=?,status=?,files_scanned=?,events_imported=?,warning_count=?,warnings_json=? WHERE id=?').run(now, result.ok ? 'success' : 'error', result.files, result.events, result.warnings.length, JSON.stringify(result.warnings), id); this.db.prepare('UPDATE sources SET status=?,last_successful_scan=CASE WHEN ? THEN ? ELSE last_successful_scan END WHERE id=?').run(result.ok ? (result.files > 0 ? 'healthy' : 'not found') : 'error', result.ok ? 1 : 0, now, sourceId) }
  dashboard(periodInput: unknown = 'thisMonth', now = new Date()): Dashboard {
    const { period, range } = rangeFor(periodInput, now); const params = [range.start, range.end]
    const row = this.db.prepare(`SELECT count(*) eventCount,count(DISTINCT source_id || char(0) || session_id) sessionCount,count(DISTINCT strftime('%Y-%m-%d', occurred_at, 'localtime')) activeDayCount,coalesce(sum(input_tokens),0) inputTokens,coalesce(sum(output_tokens),0) outputTokens,coalesce(sum(cached_input_tokens),0) cachedInputTokens,coalesce(sum(cache_write_input_tokens),0) cacheWriteInputTokens,coalesce(sum(reasoning_output_tokens),0) reasoningOutputTokens,coalesce(sum(total_tokens),0) totalTokens FROM usage_events WHERE occurred_at>=? AND occurred_at<?`).get(...params) as Record<string, number>
    const bucket = period === 'today' ? "strftime('%Y-%m-%d %H:00', occurred_at, 'localtime')" : period === 'last6Months' ? "strftime('%Y-%m', occurred_at, 'localtime')" : "strftime('%Y-%m-%d', occurred_at, 'localtime')"
    const sourceDefinitions = [{ sourceId: CODEX_SOURCE_ID, label: 'Codex' }, { sourceId: CLAUDE_SOURCE_ID, label: 'Claude Code' }, { sourceId: COPILOT_SOURCE_ID, label: 'GitHub Copilot' }]
    const costEvents = this.db.prepare('SELECT source_id sourceId,coalesce(model,\'Unknown\') model,input_tokens inputTokens,output_tokens outputTokens,cached_input_tokens cachedInputTokens,cache_write_input_tokens cacheWriteInputTokens,reasoning_output_tokens reasoningOutputTokens FROM usage_events WHERE occurred_at>=? AND occurred_at<?').all(...params) as Array<Pick<UsageEvent, 'sourceId' | 'model' | 'inputTokens' | 'outputTokens' | 'cachedInputTokens' | 'cacheWriteInputTokens' | 'reasoningOutputTokens'>>
    const costs = summarizeCosts(costEvents)
    const usage = 'coalesce(sum(input_tokens),0) inputTokens,coalesce(sum(output_tokens),0) outputTokens,coalesce(sum(cached_input_tokens),0) cachedInputTokens,coalesce(sum(cache_write_input_tokens),0) cacheWriteInputTokens,coalesce(sum(reasoning_output_tokens),0) reasoningOutputTokens,coalesce(sum(total_tokens),0) totalTokens'
    const trend = this.db.prepare(`SELECT ${bucket} bucket,coalesce(model,'Unknown') model,source_id sourceId,count(*) eventCount,${usage} FROM usage_events WHERE occurred_at>=? AND occurred_at<? GROUP BY bucket,model,source_id ORDER BY bucket,model,source_id`).all(...params) as Dashboard['trend']
    type ModelTotalRow = TokenUsage & { model: string; sourceId: string; eventCount: number }
    const modelTotalRows = this.db.prepare(`SELECT coalesce(model,'Unknown') model,source_id sourceId,count(*) eventCount,${usage} FROM usage_events WHERE occurred_at>=? AND occurred_at<? GROUP BY model,source_id ORDER BY totalTokens DESC,model,source_id`).all(...params) as ModelTotalRow[]
    const modelTotals = modelTotalRows.map((model) => ({ ...model, estimatedCost: costs.bySeries.get(costKey(model.sourceId, model.model)) ?? unknownCost(model.eventCount) }))
    const daily = this.db.prepare(`SELECT ${bucket} day,coalesce(sum(total_tokens),0) totalTokens FROM usage_events WHERE occurred_at>=? AND occurred_at<? GROUP BY day ORDER BY day DESC`).all(...params) as Dashboard['daily']
    const categories = this.db.prepare(`SELECT 'Input' category,coalesce(sum(input_tokens),0) tokens FROM usage_events WHERE occurred_at>=? AND occurred_at<? UNION ALL SELECT 'Output',coalesce(sum(output_tokens),0) FROM usage_events WHERE occurred_at>=? AND occurred_at<? UNION ALL SELECT 'Cached input',coalesce(sum(cached_input_tokens),0) FROM usage_events WHERE occurred_at>=? AND occurred_at<? UNION ALL SELECT 'Reasoning',coalesce(sum(reasoning_output_tokens),0) FROM usage_events WHERE occurred_at>=? AND occurred_at<?`).all(...params, ...params, ...params, ...params) as Dashboard['categories']
    const sources = sourceDefinitions.map(({ sourceId, label }) => { const source = this.db.prepare('SELECT status,last_successful_scan lastSuccessfulScan FROM sources WHERE id=?').get(sourceId) as { status: string; lastSuccessfulScan: string | null } | undefined; const recent = this.db.prepare('SELECT files_scanned filesScanned,events_imported eventsImported,warnings_json FROM scan_runs WHERE source_id=? ORDER BY id DESC LIMIT 1').get(sourceId) as { filesScanned: number; eventsImported: number; warnings_json: string } | undefined; return { sourceId, label, status: source?.status ?? 'not scanned', lastSuccessfulScan: source?.lastSuccessfulScan ?? null, filesScanned: recent?.filesScanned ?? 0, eventsImported: recent?.eventsImported ?? 0, warnings: recent ? JSON.parse(recent.warnings_json) : [] } })
    return { period, range, totals: { inputTokens: row.inputTokens, outputTokens: row.outputTokens, cachedInputTokens: row.cachedInputTokens, cacheWriteInputTokens: row.cacheWriteInputTokens, reasoningOutputTokens: row.reasoningOutputTokens, totalTokens: row.totalTokens }, estimatedCost: costs.total, pricingSnapshots: costs.snapshots, eventCount: row.eventCount, sessionCount: row.sessionCount, activeDayCount: row.activeDayCount, daily, trend, modelTotals, categories, sources }
  }
  close(): void { this.db.close() }
}
