import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TokenDatabase, verifyDatabaseBackup } from '../src/main/database'
import { backupAndClearDatabase } from '../src/main/database-reset'
import { providerMigrations, sourceDefinitions } from '../src/main/providers/registry'

const cleanup: Array<{ database: TokenDatabase; directory: string }> = []

afterEach(() => {
  while (cleanup.length) {
    const item = cleanup.pop()!
    item.database.close()
    rmSync(item.directory, { recursive: true, force: true })
  }
})

describe('database reset support', () => {
  it('creates a verified backup and clears imported data while keeping the schema', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'tokenstats-reset-'))
    const database = new TokenDatabase(join(directory, 'usage.sqlite'), sourceDefinitions, providerMigrations)
    cleanup.push({ database, directory })
    database.writeFile('codex-current-user', 'rollout.jsonl', 42, [{
      eventId: 'event-1', sourceId: 'codex-current-user', sessionId: 'session-1', occurredAt: '2026-08-12T10:00:00.000Z',
      inputTokens: 10, outputTokens: 5, cachedInputTokens: 1, cacheWriteInputTokens: 0, reasoningOutputTokens: 2, totalTokens: 15,
      relativeFile: 'rollout.jsonl', byteOffset: 41, parserVersion: 'codex-jsonl-v3', model: 'gpt-5.6-sol'
    }])
    database.setFileSignature('codex-current-user', 'rollout.jsonl', 'signature')
    const counts = database.getDataCounts()

    const result = await backupAndClearDatabase(database, { userData: directory, appVersion: 'test-version', now: new Date('2026-08-12T10:00:00.000Z') })

    expect(result).toMatchObject({ ok: true, eventsBackedUp: 1 })
    const backup = join(directory, 'backups', result.backupName!)
    expect(verifyDatabaseBackup(backup, counts)).toBe(true)
    expect(JSON.parse(readFileSync(`${backup}.json`, 'utf8'))).toMatchObject({ format: 'tokenstats-database-backup', appVersion: 'test-version', schemaVersion: 6, dataCounts: counts })
    expect(counts).toMatchObject({ events: 1, cursors: 1, fileSignatures: 1 })
    expect(database.getDataCounts()).toEqual({ events: 0, cursors: 0, fileSignatures: 0, scanRuns: 0, sources: 0 })
    expect(database.schemaVersion()).toBe(6)
    expect(database.db.prepare('SELECT count(*) FROM schema_migrations').pluck().get()).toBe(6)
    expect(database.db.prepare('SELECT count(*) FROM provider_migrations').pluck().get()).toBe(providerMigrations.length)
  })

  it('fails verification when a backup does not match the source counts', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'tokenstats-reset-'))
    const database = new TokenDatabase(join(directory, 'usage.sqlite'), sourceDefinitions, providerMigrations)
    cleanup.push({ database, directory })
    const backup = join(directory, 'backup.sqlite')
    await database.backup(backup)
    expect(verifyDatabaseBackup(backup, { events: 1, cursors: 0, fileSignatures: 0, scanRuns: 0, sources: 0 })).toBe(false)
  })
})
