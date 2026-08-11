import type Database from 'better-sqlite3'
import type { SourceStatus, TokenUsage, Warning } from '../../shared/contracts'

export type UsageEvent = TokenUsage & {
  eventId: string
  sourceId: string
  sessionId: string
  occurredAt: string
  relativeFile: string
  byteOffset: number
  parserVersion: string
  model: string
  included?: boolean
}

export type SourceDefinition = {
  sourceId: string
  providerId: string
  label: string
  kind: string
}

export type ProviderScanResult = {
  files: number
  events: number
  warnings: Warning[]
  status?: SourceStatus
}

export type DiscoveryContext = {
  home: string
  env: NodeJS.ProcessEnv
}

export type ProviderSource = SourceDefinition & {
  parserVersion: string
  root: string
  scan: (store: IngestionStore, root: string) => ProviderScanResult
}

export type ProviderMigration = {
  id: string
  version: number
  migrate: (database: Database.Database) => void
}

export interface IngestionStore {
  getCursor(sourceId: string, relativeFile: string): number
  getFileSignature(sourceId: string, relativeFile: string): string | null
  setFileSignature(sourceId: string, relativeFile: string, signature: string): void
  resetFileTracking(sourceId: string, relativeFile: string): void
  writeFile(sourceId: string, relativeFile: string, cursor: number, events: UsageEvent[], updateExisting?: boolean): number
  reconcileSnapshot(sourceId: string, relativeFile: string, cursor: number, events: UsageEvent[]): number
  activateFile(sourceId: string, relativeFile: string): number
  deactivatePreferredFile(sourceId: string, relativeFile: string): number
  reconcilePreferredFile(sourceId: string, relativeFile: string): { removedFallback: number; activeEvents: number; completeEvents: number }
}
