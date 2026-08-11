import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('electron', () => ({ app: { whenReady: () => new Promise<void>(() => {}), on: () => undefined, quit: () => undefined }, BrowserWindow: class {}, ipcMain: { handle: () => undefined } }))

import { currentSources, nextZoomFactor, scanAllSources, sourceRoot, zoomShortcutAction } from '../src/main/index'
import { PARSER_VERSION as COPILOT_PARSER_VERSION, SOURCE_ID as COPILOT_SOURCE_ID, scanCopilot } from '../src/main/copilot'
import { TokenDatabase } from '../src/main/database'
import { providerMigrations, sourceDefinitions } from '../src/main/providers/registry'

const cleanup: Array<{ db: TokenDatabase; directory: string }> = []
afterEach(() => { while (cleanup.length) { const item = cleanup.pop()!; item.db.close(); rmSync(item.directory, { recursive: true, force: true }) } })

describe('multi-source orchestration', () => {
  it('uses only absolute source overrides and otherwise keeps current-user defaults', () => { const sources = currentSources('/current-user', { CLAUDE_CONFIG_DIR: 'relative-config', COPILOT_HOME: '/copilot-home' } as NodeJS.ProcessEnv); expect(sources.map((source) => source.root)).toEqual(['/current-user/.codex/sessions', '/current-user/.claude/projects', '/copilot-home/session-state']); expect(sourceRoot('', '/fallback')).toBe('/fallback') })
  it('records every source and continues after an isolated source failure', () => { const directory = mkdtempSync(join(tmpdir(), 'tokenstats-')); const db = new TokenDatabase(join(directory, 'usage.sqlite'), sourceDefinitions, providerMigrations); cleanup.push({ db, directory }); const result = scanAllSources(db, [
    { sourceId: 'one', providerId: 'test-one', label: 'One', kind: 'codex' as const, parserVersion: 'one', root: '/unused', scan: () => ({ files: 1, events: 2, warnings: [] }) },
    { sourceId: 'two', providerId: 'test-two', label: 'Two', kind: 'claude' as const, parserVersion: 'two', root: '/unused', scan: () => { throw new Error('private path') } },
    { sourceId: 'three', providerId: 'test-three', label: 'Three', kind: 'copilot' as const, parserVersion: 'three', root: '/unused', scan: () => ({ files: 0, events: 0, warnings: [] }) }
  ]); expect(result).toMatchObject({ ok: false, filesScanned: 1, eventsImported: 2, sources: [{ sourceId: 'one', status: 'success' }, { sourceId: 'two', status: 'error', error: 'Scan failed. Check source availability and try again.' }, { sourceId: 'three', status: 'not found' }] }); expect(result.sources[1].error).not.toContain('private path'); expect(db.db.prepare('SELECT source_id,status FROM scan_runs ORDER BY id').all()).toEqual([{ source_id: 'one', status: 'success' }, { source_id: 'two', status: 'error' }, { source_id: 'three', status: 'success' }]) })
  it('treats an explicit source error status as a failed scan', () => { const directory = mkdtempSync(join(tmpdir(), 'tokenstats-')); const db = new TokenDatabase(join(directory, 'usage.sqlite'), sourceDefinitions, providerMigrations); cleanup.push({ db, directory }); const result = scanAllSources(db, [{ sourceId: 'explicit-error', providerId: 'test-error', label: 'Explicit error', kind: 'codex' as const, parserVersion: 'explicit-error', root: '/unused', scan: () => ({ files: 0, events: 0, warnings: [], status: 'error' as const }) }]); expect(result).toMatchObject({ ok: false, sources: [{ sourceId: 'explicit-error', status: 'error', error: 'Scan failed. Check source availability and try again.' }] }); expect(db.db.prepare('SELECT status FROM scan_runs').pluck().get()).toBe('error'); expect(db.db.prepare('SELECT status FROM sources WHERE id=?').pluck().get('explicit-error')).toBe('error') })
  it('resets a Copilot cursor on parser-version change without duplicating the snapshot', () => { const directory = mkdtempSync(join(tmpdir(), 'tokenstats-')); const db = new TokenDatabase(join(directory, 'usage.sqlite'), sourceDefinitions, providerMigrations); cleanup.push({ db, directory }); const root = join(directory, 'session-state'); const session = join(root, 'session-a'); mkdirSync(session, { recursive: true }); const file = join(session, 'events.jsonl'); writeFileSync(file, JSON.stringify({ type: 'session.shutdown', id: 'shutdown-migration', timestamp: '2026-08-11T09:00:00Z', data: { modelMetrics: { 'claude-sonnet-5': { usage: { inputTokens: 20, outputTokens: 8 } } } } }) + '\n'); const source = { sourceId: COPILOT_SOURCE_ID, providerId: 'copilot', label: 'GitHub Copilot', kind: 'copilot' as const, parserVersion: 'copilot-events-v1', root, scan: scanCopilot }; expect(scanAllSources(db, [source]).eventsImported).toBe(1); source.parserVersion = COPILOT_PARSER_VERSION; expect(scanAllSources(db, [source]).eventsImported).toBe(0); expect(db.db.prepare("SELECT count(*) FROM usage_events WHERE source_id=?").pluck().get(COPILOT_SOURCE_ID)).toBe(1); expect(db.db.prepare("SELECT parser_version FROM sources WHERE id=?").pluck().get(COPILOT_SOURCE_ID)).toBe(COPILOT_PARSER_VERSION) })
})

describe('application zoom shortcuts', () => {
  const input = (overrides: Partial<Parameters<typeof zoomShortcutAction>[0]> = {}) => ({ type: 'keyDown', key: '', code: '', control: true, meta: false, alt: false, ...overrides })

  it('recognizes primary plus, minus, and reset variants once per keydown', () => {
    expect(zoomShortcutAction(input({ key: '+', code: 'Equal' }))).toBe('in')
    expect(zoomShortcutAction(input({ key: '=', code: 'Equal' }))).toBe('in')
    expect(zoomShortcutAction(input({ key: 'Add', code: 'NumpadAdd' }))).toBe('in')
    expect(zoomShortcutAction(input({ key: '-', code: 'Minus' }))).toBe('out')
    expect(zoomShortcutAction(input({ key: 'Subtract', code: 'NumpadSubtract' }))).toBe('out')
    expect(zoomShortcutAction(input({ key: '0', code: 'Digit0', control: false, meta: true }))).toBe('reset')
    expect(zoomShortcutAction(input({ type: 'keyUp', key: '+' }))).toBeUndefined()
    expect(zoomShortcutAction(input({ key: '+', alt: true }))).toBeUndefined()
  })

  it('uses bounded 10% steps and restores the default zoom', () => {
    expect(nextZoomFactor('in', 1)).toBe(1.1)
    expect(nextZoomFactor('out', 1)).toBe(0.9)
    expect(nextZoomFactor('in', 1.5)).toBe(1.5)
    expect(nextZoomFactor('out', 0.8)).toBe(0.8)
    expect(nextZoomFactor('reset', 1.4)).toBe(1)
  })
})
