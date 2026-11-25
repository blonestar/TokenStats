import type { ScanResult, ScanSourceResult } from '../shared/contracts'
import type { TokenDatabase } from './database'
import type { ProviderSource } from './ingestion/contracts'
import { currentSources as discoverCurrentSources } from './providers/registry'

type Source = ProviderSource

export function currentSources(home?: string, env?: NodeJS.ProcessEnv): Source[] { return discoverCurrentSources(home, env) }

export function scanAllSources(db: TokenDatabase, sources = currentSources()): ScanResult {
  const results: ScanSourceResult[] = []; let filesScanned = 0; let eventsImported = 0; let warnings = 0
  for (const source of sources) { const runId = db.beginScan(source.sourceId, source.kind, source.parserVersion); try { const result = source.scan(db, source.root); const status: ScanSourceResult['status'] = result.status ?? (result.files > 0 ? 'success' : 'not found'); const sourceOk = status !== 'error'; db.finishScan(runId, source.sourceId, { ...result, ok: sourceOk, status: sourceOk ? (status === 'success' ? 'healthy' : status) : 'error' }); filesScanned += result.files; eventsImported += result.events; warnings += result.warnings.length; results.push({ sourceId: source.sourceId, providerId: source.providerId, label: source.label, kind: source.kind, status, filesScanned: result.files, eventsImported: result.events, warnings: result.warnings.length, ...(sourceOk ? {} : { error: 'Scan failed. Check source availability and try again.' }) }) } catch { const sourceWarnings = [{ message: `${source.label} scan failed without storing source content.`, count: 1 }]; db.finishScan(runId, source.sourceId, { files: 0, events: 0, warnings: sourceWarnings, ok: false }); warnings += 1; results.push({ sourceId: source.sourceId, providerId: source.providerId, label: source.label, kind: source.kind, status: 'error', filesScanned: 0, eventsImported: 0, warnings: 1, error: 'Scan failed. Check source availability and try again.' }) } }
  return { ok: results.every((result) => result.status !== 'error'), filesScanned, eventsImported, warnings, sources: results }
}

