import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ResetDatabaseResult } from '../shared/contracts'
import { TokenDatabase, verifyDatabaseBackup } from './database'

type BackupPaths = { database: string; metadata: string; name: string }

function tryRemove(file: string | undefined): void {
  if (!file) return
  try { unlinkSync(file) } catch { /* best-effort cleanup of a failed backup */ }
}

export function backupPaths(userData: string, now = new Date()): BackupPaths {
  const directory = join(userData, 'backups')
  mkdirSync(directory, { recursive: true })
  const timestamp = now.toISOString().replaceAll(':', '-').replaceAll('.', '-')
  const prefix = `tokenstats-reset-${timestamp}`
  let suffix = 0
  while (true) {
    const name = `${prefix}${suffix === 0 ? '' : `-${suffix}`}.sqlite`
    const database = join(directory, name)
    const metadata = `${database}.json`
    if (!existsSync(database) && !existsSync(metadata)) return { database, metadata, name }
    suffix += 1
  }
}

export async function backupAndClearDatabase(database: TokenDatabase, options: { userData: string; appVersion: string; now?: Date }): Promise<ResetDatabaseResult> {
  let backupFile: string | undefined
  let metadataFile: string | undefined
  let backupVerified = false
  try {
    const counts = database.getDataCounts()
    const paths = backupPaths(options.userData, options.now)
    backupFile = paths.database
    metadataFile = paths.metadata
    await database.backup(backupFile)
    if (!verifyDatabaseBackup(backupFile, counts)) {
      tryRemove(backupFile)
      return { ok: false, error: 'The database backup could not be verified. Existing data was kept.' }
    }
    backupVerified = true
    writeFileSync(metadataFile, `${JSON.stringify({ format: 'tokenstats-database-backup', formatVersion: 1, createdAt: (options.now ?? new Date()).toISOString(), appVersion: options.appVersion, schemaVersion: database.schemaVersion(), dataCounts: counts }, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
    database.clearImportedData()
    return { ok: true, backupName: paths.name, eventsBackedUp: counts.events }
  } catch {
    if (!backupVerified) {
      tryRemove(backupFile)
      tryRemove(metadataFile)
    }
    return { ok: false, error: 'The database could not be reset. Existing data was kept.' }
  }
}
