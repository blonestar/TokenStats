import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_REFRESH_SETTINGS, REFRESH_INTERVAL_MINUTES, type RefreshIntervalMinutes, type RefreshSettings } from '../shared/contracts'

export const REFRESH_SETTINGS_FILE_NAME = 'refresh-settings.json'

function isRefreshIntervalMinutes(value: unknown): value is RefreshIntervalMinutes {
  return typeof value === 'number' && Number.isInteger(value) && REFRESH_INTERVAL_MINUTES.includes(value as RefreshIntervalMinutes)
}

export function parseRefreshSettings(value: unknown): RefreshSettings | null {
  if (!value || typeof value !== 'object') return null
  const settings = value as Partial<RefreshSettings>
  if (typeof settings.enabled !== 'boolean' || !isRefreshIntervalMinutes(settings.intervalMinutes)) return null
  return { enabled: settings.enabled, intervalMinutes: settings.intervalMinutes }
}

export function loadRefreshSettings(userDataPath: string): RefreshSettings {
  try {
    return parseRefreshSettings(JSON.parse(readFileSync(join(userDataPath, REFRESH_SETTINGS_FILE_NAME), 'utf8'))) ?? DEFAULT_REFRESH_SETTINGS
  } catch {
    return DEFAULT_REFRESH_SETTINGS
  }
}

export function saveRefreshSettings(userDataPath: string, settings: RefreshSettings): void {
  mkdirSync(userDataPath, { recursive: true })
  const path = join(userDataPath, REFRESH_SETTINGS_FILE_NAME)
  const temporaryPath = `${path}.tmp`
  writeFileSync(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
  renameSync(temporaryPath, path)
}
