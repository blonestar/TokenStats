import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { IngestionStore, ProviderMigration, SourceDefinition, UsageEvent } from './ingestion/contracts'
import { costKey, summarizeCosts, unknownCost } from './pricing'
import { providerMigrations as registeredProviderMigrations, sourceDefinitions as registeredSourceDefinitions } from './providers/registry'
import type { Dashboard, DashboardBucket, DashboardPeriod, DashboardRange, SourceStatus, TokenUsage, Warning } from '../shared/contracts'

export type { UsageEvent } from './ingestion/contracts'

const periods: DashboardPeriod[] = ['today', 'yesterday', 'thisWeek', 'lastWeek', 'thisMonth', 'lastMonth', 'last6Months']
const validPeriod = (value: unknown): DashboardPeriod => periods.includes(value as DashboardPeriod) ? value as DashboardPeriod : 'thisMonth'
const localDate = (date: Date): string => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const startOfDay = (date: Date): Date => { const value = new Date(date); value.setHours(0, 0, 0, 0); return value }
const startOfWeek = (date: Date): Date => { const value = startOfDay(date); const daysFromMonday = (value.getDay() + 6) % 7; value.setDate(value.getDate() - daysFromMonday); return value }
const dateBucket = (period: DashboardPeriod, start: Date, end: Date): DashboardBucket => {
  const days = (end.getTime() - start.getTime()) / 86_400_000
  if (period === 'today' || period === 'yesterday' || (period === 'custom' && days <= 1)) return 'hour'
  if (period === 'last6Months' || (period === 'custom' && days > 62)) return 'month'
  return 'day'
}
const rangeFromDates = (period: DashboardPeriod, start: Date, end: Date): DashboardRange => {
  const endLabel = new Date(end)
  endLabel.setDate(endLabel.getDate() - 1)
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    startLabel: localDate(start),
    endLabel: localDate(endLabel),
    label: period === 'today' ? localDate(start) : `${localDate(start)} to ${localDate(endLabel)}`,
    bucket: dateBucket(period, start, end)
  }
}
function parseLocalDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? startOfDay(date) : null
}

function rangeFor(periodInput: unknown, now: Date): { period: DashboardPeriod; range: DashboardRange } {
  if (typeof periodInput === 'object' && periodInput !== null && (periodInput as { period?: unknown }).period === 'custom') {
    const custom = periodInput as { startDate?: unknown; endDate?: unknown }
    const start = parseLocalDate(custom.startDate)
    const selectedEnd = parseLocalDate(custom.endDate)
    if (start && selectedEnd && selectedEnd >= start) {
      const end = new Date(selectedEnd)
      end.setDate(end.getDate() + 1)
      return { period: 'custom', range: rangeFromDates('custom', start, end) }
    }
  }
  const period = validPeriod(periodInput); const today = startOfDay(now); let start: Date; let end: Date
  if (period === 'today') { start = today; end = new Date(start); end.setDate(end.getDate() + 1) }
  else if (period === 'yesterday') { end = today; start = new Date(end); start.setDate(start.getDate() - 1) }
  else if (period === 'thisWeek') { start = startOfWeek(today); end = new Date(start); end.setDate(end.getDate() + 7) }
  else if (period === 'lastWeek') { end = startOfWeek(today); start = new Date(end); start.setDate(start.getDate() - 7) }
  else if (period === 'thisMonth') { start = new Date(today); start.setDate(1); end = new Date(start); end.setMonth(end.getMonth() + 1) }
  else if (period === 'lastMonth') { end = new Date(today); end.setDate(1); start = new Date(end); start.setMonth(start.getMonth() - 1) }
  else { end = new Date(today); end.setDate(1); end.setMonth(end.getMonth() + 1); start = new Date(end); start.setMonth(start.getMonth() - 6) }
  return { period, range: rangeFromDates(period, start, end) }
}

export class TokenDatabase implements IngestionStore {
  readonly db: Database.Database
  private readonly sourceDefinitions: readonly SourceDefinition[]
  private readonly providerMigrations: readonly ProviderMigration[]
  constructor(file: string, sourceDefinitions: readonly SourceDefinition[] = registeredSourceDefinitions, providerMigrations: readonly ProviderMigration[] = registeredProviderMigrations) { mkdirSync(dirname(file), { recursive: true }); this.db = new Database(file); this.sourceDefinitions = sourceDefinitions; this.providerMigrations = providerMigrations; this.migrate() }
  private migrate(): void {
    this.db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY, kind TEXT NOT NULL, status TEXT NOT NULL, parser_version TEXT NOT NULL, last_successful_scan TEXT);
CREATE TABLE IF NOT EXISTS source_cursors (source_id TEXT NOT NULL, relative_file TEXT NOT NULL, byte_offset INTEGER NOT NULL, PRIMARY KEY(source_id, relative_file));
CREATE TABLE IF NOT EXISTS scan_runs (id INTEGER PRIMARY KEY, source_id TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT, status TEXT NOT NULL, files_scanned INTEGER NOT NULL DEFAULT 0, events_imported INTEGER NOT NULL DEFAULT 0, warning_count INTEGER NOT NULL DEFAULT 0, warnings_json TEXT NOT NULL DEFAULT '[]');
CREATE TABLE IF NOT EXISTS usage_events (event_id TEXT PRIMARY KEY, source_id TEXT NOT NULL, session_id TEXT NOT NULL, occurred_at TEXT NOT NULL, input_tokens INTEGER, output_tokens INTEGER, cached_input_tokens INTEGER, cache_write_input_tokens INTEGER, reasoning_output_tokens INTEGER, total_tokens INTEGER, relative_file TEXT NOT NULL, byte_offset INTEGER NOT NULL, parser_version TEXT NOT NULL, inserted_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS provider_migrations (migration_id TEXT NOT NULL, version INTEGER NOT NULL, applied_at TEXT NOT NULL, PRIMARY KEY(migration_id, version));
INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(1, datetime('now'));`)
    const hasV2 = this.db.prepare('SELECT 1 FROM schema_migrations WHERE version=2').get()
    if (!hasV2) this.db.transaction(() => { this.db.exec('ALTER TABLE usage_events ADD COLUMN model TEXT'); this.db.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES(2, datetime('now'))").run() })()
    const hasV3 = this.db.prepare('SELECT 1 FROM schema_migrations WHERE version=3').get()
    if (!hasV3) this.db.transaction(() => { this.db.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES(3, datetime('now'))").run() })()
    const hasV4 = this.db.prepare('SELECT 1 FROM schema_migrations WHERE version=4').get()
    if (!hasV4) this.db.transaction(() => {
      this.db.exec('ALTER TABLE usage_events ADD COLUMN included INTEGER NOT NULL DEFAULT 1; CREATE TABLE IF NOT EXISTS source_file_signatures (source_id TEXT NOT NULL, relative_file TEXT NOT NULL, prefix_hash TEXT NOT NULL, PRIMARY KEY(source_id, relative_file));')
      this.db.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES(4, datetime('now'))").run()
    })()
    const hasV5 = this.db.prepare('SELECT 1 FROM schema_migrations WHERE version=5').get()
    if (!hasV5) this.db.transaction(() => {
      this.db.exec('ALTER TABLE source_file_signatures RENAME COLUMN prefix_hash TO file_signature')
      this.db.exec('DELETE FROM source_file_signatures')
      this.db.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES(5, datetime('now'))").run()
    })()
    const hasV6 = this.db.prepare('SELECT 1 FROM schema_migrations WHERE version=6').get()
    if (!hasV6) this.db.transaction(() => {
      this.db.exec('CREATE TABLE IF NOT EXISTS provider_migrations (migration_id TEXT NOT NULL, version INTEGER NOT NULL, applied_at TEXT NOT NULL, PRIMARY KEY(migration_id, version))')
      this.db.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES(6, datetime('now'))").run()
    })()
    this.db.transaction(() => {
      const applied = this.db.prepare('SELECT 1 FROM provider_migrations WHERE migration_id=? AND version=?')
      const record = this.db.prepare('INSERT INTO provider_migrations(migration_id,version,applied_at) VALUES(?,?,?)')
      for (const migration of this.providerMigrations) {
        if (applied.get(migration.id, migration.version)) continue
        migration.migrate(this.db)
        record.run(migration.id, migration.version, new Date().toISOString())
      }
    })()
  }
  getCursor(sourceId: string, relativeFile: string): number { return this.db.prepare('SELECT byte_offset FROM source_cursors WHERE source_id=? AND relative_file=?').pluck().get(sourceId, relativeFile) as number | undefined ?? 0 }
  getFileSignature(sourceId: string, relativeFile: string): string | null { return this.db.prepare('SELECT file_signature FROM source_file_signatures WHERE source_id=? AND relative_file=?').pluck().get(sourceId, relativeFile) as string | undefined ?? null }
  setFileSignature(sourceId: string, relativeFile: string, signature: string): void { this.db.prepare('INSERT INTO source_file_signatures VALUES(?,?,?) ON CONFLICT(source_id,relative_file) DO UPDATE SET file_signature=excluded.file_signature').run(sourceId, relativeFile, signature) }
  resetFileTracking(sourceId: string, relativeFile: string): void { this.db.transaction(() => { this.db.prepare('DELETE FROM source_cursors WHERE source_id=? AND relative_file=?').run(sourceId, relativeFile); this.db.prepare('DELETE FROM source_file_signatures WHERE source_id=? AND relative_file=?').run(sourceId, relativeFile) })() }
  writeFile(sourceId: string, relativeFile: string, cursor: number, events: UsageEvent[], updateExisting = false): number {
    const insert = this.db.prepare(`INSERT OR IGNORE INTO usage_events (event_id,source_id,session_id,occurred_at,input_tokens,output_tokens,cached_input_tokens,cache_write_input_tokens,reasoning_output_tokens,total_tokens,relative_file,byte_offset,parser_version,inserted_at,model,included) VALUES (@eventId,@sourceId,@sessionId,@occurredAt,@inputTokens,@outputTokens,@cachedInputTokens,@cacheWriteInputTokens,@reasoningOutputTokens,@totalTokens,@relativeFile,@byteOffset,@parserVersion,@insertedAt,@model,@included)`)
    const backfill = this.db.prepare("UPDATE usage_events SET model=? WHERE event_id=? AND (model IS NULL OR model='Unknown') AND ? <> 'Unknown'")
    const update = this.db.prepare('UPDATE usage_events SET source_id=@sourceId,session_id=@sessionId,occurred_at=@occurredAt,input_tokens=@inputTokens,output_tokens=@outputTokens,cached_input_tokens=@cachedInputTokens,cache_write_input_tokens=@cacheWriteInputTokens,reasoning_output_tokens=@reasoningOutputTokens,total_tokens=@totalTokens,relative_file=@relativeFile,byte_offset=@byteOffset,parser_version=@parserVersion,model=@model,included=@included WHERE event_id=@eventId')
    const write = this.db.transaction(() => { let inserted = 0; for (const event of events) { const values = { ...event, included: event.included === false ? 0 : 1, insertedAt: new Date().toISOString() }; const changed = insert.run(values).changes; inserted += changed; if (changed === 0 && updateExisting) update.run(values); else backfill.run(event.model, event.eventId, event.model) } this.db.prepare('INSERT INTO source_cursors VALUES(?,?,?) ON CONFLICT(source_id,relative_file) DO UPDATE SET byte_offset=excluded.byte_offset').run(sourceId, relativeFile, cursor); return inserted })
    return write()
  }
  reconcileSnapshot(sourceId: string, relativeFile: string, cursor: number, events: UsageEvent[]): number {
    if (events.length === 0) return this.writeFile(sourceId, relativeFile, cursor, [])
    const insert = this.db.prepare(`INSERT OR IGNORE INTO usage_events (event_id,source_id,session_id,occurred_at,input_tokens,output_tokens,cached_input_tokens,cache_write_input_tokens,reasoning_output_tokens,total_tokens,relative_file,byte_offset,parser_version,inserted_at,model,included) VALUES (@eventId,@sourceId,@sessionId,@occurredAt,@inputTokens,@outputTokens,@cachedInputTokens,@cacheWriteInputTokens,@reasoningOutputTokens,@totalTokens,@relativeFile,@byteOffset,@parserVersion,@insertedAt,@model,@included)`)
    const update = this.db.prepare('UPDATE usage_events SET source_id=@sourceId,session_id=@sessionId,occurred_at=@occurredAt,input_tokens=@inputTokens,output_tokens=@outputTokens,cached_input_tokens=@cachedInputTokens,cache_write_input_tokens=@cacheWriteInputTokens,reasoning_output_tokens=@reasoningOutputTokens,total_tokens=@totalTokens,relative_file=@relativeFile,byte_offset=@byteOffset,parser_version=@parserVersion,model=@model,included=@included WHERE event_id=@eventId')
    const ids = events.map((event) => event.eventId)
    const stale = this.db.prepare(`DELETE FROM usage_events WHERE source_id=? AND relative_file=? AND session_id=? AND event_id NOT IN (${ids.map(() => '?').join(',')})`)
    return this.db.transaction(() => { let inserted = 0; for (const event of events) { const values = { ...event, included: event.included === false ? 0 : 1, insertedAt: new Date().toISOString() }; const changed = insert.run(values).changes; inserted += changed; if (changed === 0) update.run(values) } stale.run(sourceId, relativeFile, events[0].sessionId, ...ids); this.db.prepare('INSERT INTO source_cursors VALUES(?,?,?) ON CONFLICT(source_id,relative_file) DO UPDATE SET byte_offset=excluded.byte_offset').run(sourceId, relativeFile, cursor); return inserted })()
  }
  activateFile(sourceId: string, relativeFile: string): number { return Number(this.db.prepare('UPDATE usage_events SET included=1 WHERE source_id=? AND relative_file=? AND included=0').run(sourceId, relativeFile).changes) }
  private usageAggregate(sourceId: string, relativeFile: string, sessionId: string, model: string, includeFile: boolean): TokenUsage & { count: number } {
    const fileClause = includeFile ? 'relative_file=?' : 'relative_file<>?'
    const row = this.db.prepare(`SELECT count(*) count,sum(input_tokens) inputTokens,sum(output_tokens) outputTokens,sum(cached_input_tokens) cachedInputTokens,sum(cache_write_input_tokens) cacheWriteInputTokens,sum(reasoning_output_tokens) reasoningOutputTokens,sum(total_tokens) totalTokens FROM usage_events WHERE source_id=? AND ${fileClause} AND session_id=? AND coalesce(model,'Unknown')=? AND included=1`).get(sourceId, relativeFile, sessionId, model) as TokenUsage & { count: number }
    return row
  }
  private usageAggregateAll(sourceId: string, relativeFile: string, sessionId: string, model: string): TokenUsage & { count: number } {
    const row = this.db.prepare('SELECT count(*) count,sum(input_tokens) inputTokens,sum(output_tokens) outputTokens,sum(cached_input_tokens) cachedInputTokens,sum(cache_write_input_tokens) cacheWriteInputTokens,sum(reasoning_output_tokens) reasoningOutputTokens,sum(total_tokens) totalTokens FROM usage_events WHERE source_id=? AND relative_file=? AND session_id=? AND coalesce(model,\'Unknown\')=?').get(sourceId, relativeFile, sessionId, model) as TokenUsage & { count: number }
    return row
  }
  fileEventCounts(sourceId: string, relativeFile: string): { total: number; included: number } { const row = this.db.prepare('SELECT count(*) total,sum(CASE WHEN included=1 THEN 1 ELSE 0 END) included FROM usage_events WHERE source_id=? AND relative_file=?').get(sourceId, relativeFile) as { total: number; included: number | null }; return { total: row.total, included: row.included ?? 0 } }
  deactivatePreferredFile(sourceId: string, relativeFile: string): number {
    const pairs = this.db.prepare('SELECT DISTINCT session_id sessionId,coalesce(model,\'Unknown\') model FROM usage_events WHERE source_id=? AND relative_file=?').all(sourceId, relativeFile) as Array<{ sessionId: string; model: string }>
    return this.db.transaction(() => {
      let restored = 0
      const fallbackCount = this.db.prepare('SELECT count(*) FROM usage_events WHERE source_id=? AND relative_file<>? AND session_id=? AND coalesce(model,\'Unknown\')=?')
      const deactivate = this.db.prepare('UPDATE usage_events SET included=0 WHERE source_id=? AND relative_file=? AND session_id=? AND coalesce(model,\'Unknown\')=? AND included<>0')
      const activateFallback = this.db.prepare('UPDATE usage_events SET included=1 WHERE source_id=? AND relative_file<>? AND session_id=? AND coalesce(model,\'Unknown\')=? AND included=0')
      const activateOtel = this.db.prepare('UPDATE usage_events SET included=1 WHERE source_id=? AND relative_file=? AND session_id=? AND coalesce(model,\'Unknown\')=? AND included=0')
      for (const pair of pairs) {
        if (Number(fallbackCount.pluck().get(sourceId, relativeFile, pair.sessionId, pair.model)) > 0) {
          deactivate.run(sourceId, relativeFile, pair.sessionId, pair.model)
          restored += Number(activateFallback.run(sourceId, relativeFile, pair.sessionId, pair.model).changes)
        } else {
          activateOtel.run(sourceId, relativeFile, pair.sessionId, pair.model)
        }
      }
      return restored
    })()
  }
  reconcilePreferredFile(sourceId: string, relativeFile: string): { removedFallback: number; activeEvents: number; completeEvents: number } {
    const pairs = this.db.prepare('SELECT DISTINCT session_id sessionId,coalesce(model,\'Unknown\') model FROM usage_events WHERE source_id=? AND relative_file=?').all(sourceId, relativeFile) as Array<{ sessionId: string; model: string }>
    let removedFallback = 0
    const reconcile = this.db.transaction(() => {
      for (const pair of pairs) {
        const otel = this.usageAggregateAll(sourceId, relativeFile, pair.sessionId, pair.model)
        const fallback = this.usageAggregate(sourceId, relativeFile, pair.sessionId, pair.model, false)
        const same = (fallbackValue: number | null, otelValue: number | null): boolean => fallbackValue === null || fallbackValue === otelValue
        const matches = fallback.count === 0 || (same(fallback.inputTokens, otel.inputTokens) && same(fallback.outputTokens, otel.outputTokens) && (fallback.inputTokens === null || same(fallback.totalTokens, otel.totalTokens)) && same(fallback.cachedInputTokens, otel.cachedInputTokens) && same(fallback.cacheWriteInputTokens, otel.cacheWriteInputTokens) && same(fallback.reasoningOutputTokens, otel.reasoningOutputTokens))
        this.db.prepare('UPDATE usage_events SET included=? WHERE source_id=? AND relative_file=? AND session_id=? AND coalesce(model,\'Unknown\')=?').run(matches ? 1 : 0, sourceId, relativeFile, pair.sessionId, pair.model)
        if (fallback.count > 0) removedFallback += Number(this.db.prepare('UPDATE usage_events SET included=? WHERE source_id=? AND relative_file<>? AND session_id=? AND coalesce(model,\'Unknown\')=? AND included<>?').run(matches ? 0 : 1, sourceId, relativeFile, pair.sessionId, pair.model, matches ? 0 : 1).changes)
      }
    })
    reconcile()
    const counts = this.fileEventCounts(sourceId, relativeFile)
    return { removedFallback, activeEvents: counts.included, completeEvents: counts.total }
  }
  beginScan(sourceId: string, kind: string, parserVersion: string): number {
    const source = this.db.prepare('SELECT parser_version FROM sources WHERE id=?').get(sourceId) as { parser_version: string } | undefined
    const begin = this.db.transaction(() => { if (source && source.parser_version !== parserVersion) { this.db.prepare('DELETE FROM source_cursors WHERE source_id=?').run(sourceId); this.db.prepare('DELETE FROM source_file_signatures WHERE source_id=?').run(sourceId) } this.db.prepare("INSERT INTO sources(id,kind,status,parser_version,last_successful_scan) VALUES(?,?, 'scanning', ?, NULL) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,status='scanning',parser_version=excluded.parser_version").run(sourceId, kind, parserVersion); return Number(this.db.prepare("INSERT INTO scan_runs(source_id,started_at,status) VALUES(?,?,'running')").run(sourceId, new Date().toISOString()).lastInsertRowid) })
    return begin()
  }
  finishScan(id: number, sourceId: string, result: { files: number; events: number; warnings: Warning[]; ok: boolean; status?: SourceStatus }): void { const now = new Date().toISOString(); const sourceStatus = result.ok ? (result.status ?? (result.files > 0 ? 'healthy' : 'not found')) : 'error'; this.db.prepare('UPDATE scan_runs SET finished_at=?,status=?,files_scanned=?,events_imported=?,warning_count=?,warnings_json=? WHERE id=?').run(now, result.ok ? 'success' : 'error', result.files, result.events, result.warnings.length, JSON.stringify(result.warnings), id); this.db.prepare('UPDATE sources SET status=?,last_successful_scan=CASE WHEN ? THEN ? ELSE last_successful_scan END WHERE id=?').run(sourceStatus, result.ok ? 1 : 0, now, sourceId) }
  dashboard(periodInput: unknown = 'thisMonth', now = new Date()): Dashboard {
    const { period, range } = rangeFor(periodInput, now); const params = [range.start, range.end]
    const row = this.db.prepare(`SELECT count(*) eventCount,count(DISTINCT source_id || char(0) || session_id) sessionCount,count(DISTINCT strftime('%Y-%m-%d', occurred_at, 'localtime')) activeDayCount,coalesce(sum(input_tokens),0) inputTokens,coalesce(sum(output_tokens),0) outputTokens,coalesce(sum(cached_input_tokens),0) cachedInputTokens,coalesce(sum(cache_write_input_tokens),0) cacheWriteInputTokens,coalesce(sum(reasoning_output_tokens),0) reasoningOutputTokens,coalesce(sum(total_tokens),0) totalTokens FROM usage_events WHERE included=1 AND occurred_at>=? AND occurred_at<?`).get(...params) as Record<string, number>
    const bucket = range.bucket === 'hour' ? "strftime('%Y-%m-%d %H:00', occurred_at, 'localtime')" : range.bucket === 'month' ? "strftime('%Y-%m', occurred_at, 'localtime')" : "strftime('%Y-%m-%d', occurred_at, 'localtime')"
    const costEvents = this.db.prepare('SELECT source_id sourceId,coalesce(model,\'Unknown\') model,input_tokens inputTokens,output_tokens outputTokens,cached_input_tokens cachedInputTokens,cache_write_input_tokens cacheWriteInputTokens,reasoning_output_tokens reasoningOutputTokens FROM usage_events WHERE included=1 AND occurred_at>=? AND occurred_at<?').all(...params) as Array<Pick<UsageEvent, 'sourceId' | 'model' | 'inputTokens' | 'outputTokens' | 'cachedInputTokens' | 'cacheWriteInputTokens' | 'reasoningOutputTokens'>>
    const costs = summarizeCosts(costEvents)
    const usage = 'coalesce(sum(input_tokens),0) inputTokens,coalesce(sum(output_tokens),0) outputTokens,coalesce(sum(cached_input_tokens),0) cachedInputTokens,coalesce(sum(cache_write_input_tokens),0) cacheWriteInputTokens,coalesce(sum(reasoning_output_tokens),0) reasoningOutputTokens,coalesce(sum(total_tokens),0) totalTokens'
    const trend = this.db.prepare(`SELECT ${bucket} bucket,coalesce(model,'Unknown') model,source_id sourceId,count(*) eventCount,${usage} FROM usage_events WHERE included=1 AND occurred_at>=? AND occurred_at<? GROUP BY bucket,model,source_id ORDER BY bucket,model,source_id`).all(...params) as Dashboard['trend']
    type ModelTotalRow = TokenUsage & { model: string; sourceId: string; eventCount: number }
    const modelTotalRows = this.db.prepare(`SELECT coalesce(model,'Unknown') model,source_id sourceId,count(*) eventCount,${usage} FROM usage_events WHERE included=1 AND occurred_at>=? AND occurred_at<? GROUP BY model,source_id ORDER BY totalTokens DESC,model,source_id`).all(...params) as ModelTotalRow[]
    const modelTotals = modelTotalRows.map((model) => ({ ...model, estimatedCost: costs.bySeries.get(costKey(model.sourceId, model.model)) ?? unknownCost(model.eventCount) }))
    const daily = this.db.prepare(`SELECT ${bucket} day,coalesce(sum(total_tokens),0) totalTokens FROM usage_events WHERE included=1 AND occurred_at>=? AND occurred_at<? GROUP BY day ORDER BY day DESC`).all(...params) as Dashboard['daily']
    const categories = this.db.prepare(`SELECT 'Input' category,coalesce(sum(input_tokens),0) tokens FROM usage_events WHERE included=1 AND occurred_at>=? AND occurred_at<? UNION ALL SELECT 'Output',coalesce(sum(output_tokens),0) FROM usage_events WHERE included=1 AND occurred_at>=? AND occurred_at<? UNION ALL SELECT 'Cached input',coalesce(sum(cached_input_tokens),0) FROM usage_events WHERE included=1 AND occurred_at>=? AND occurred_at<? UNION ALL SELECT 'Reasoning',coalesce(sum(reasoning_output_tokens),0) FROM usage_events WHERE included=1 AND occurred_at>=? AND occurred_at<?`).all(...params, ...params, ...params, ...params) as Dashboard['categories']
    const sources = this.sourceDefinitions.map(({ sourceId, providerId, label }) => { const source = this.db.prepare('SELECT status,last_successful_scan lastSuccessfulScan FROM sources WHERE id=?').get(sourceId) as { status: SourceStatus; lastSuccessfulScan: string | null } | undefined; const recent = this.db.prepare('SELECT files_scanned filesScanned,events_imported eventsImported,warnings_json FROM scan_runs WHERE source_id=? ORDER BY id DESC LIMIT 1').get(sourceId) as { filesScanned: number; eventsImported: number; warnings_json: string } | undefined; return { sourceId, providerId, label, status: source?.status ?? 'not scanned', lastSuccessfulScan: source?.lastSuccessfulScan ?? null, filesScanned: recent?.filesScanned ?? 0, eventsImported: recent?.eventsImported ?? 0, warnings: recent ? JSON.parse(recent.warnings_json) : [] } })
    return { period, range, totals: { inputTokens: row.inputTokens, outputTokens: row.outputTokens, cachedInputTokens: row.cachedInputTokens, cacheWriteInputTokens: row.cacheWriteInputTokens, reasoningOutputTokens: row.reasoningOutputTokens, totalTokens: row.totalTokens }, estimatedCost: costs.total, pricingSnapshots: costs.snapshots, eventCount: row.eventCount, sessionCount: row.sessionCount, activeDayCount: row.activeDayCount, daily, trend, modelTotals, categories, sources }
  }
  close(): void { this.db.close() }
}
