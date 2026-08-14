import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_UPDATE_SETTINGS, UPDATE_INTERVAL_HOURS, type UpdateIntervalHours, type UpdateSettings } from '../shared/contracts'

export const UPDATE_SETTINGS_FILE_NAME = 'update-settings.json'

function isUpdateIntervalHours(value: unknown): value is UpdateIntervalHours {
  return typeof value === 'number' && UPDATE_INTERVAL_HOURS.includes(value as UpdateIntervalHours)
}

export function parseUpdateSettings(value: unknown): UpdateSettings | null {
  if (!value || typeof value !== 'object') return null
  const settings = value as Partial<UpdateSettings>
  if (typeof settings.enabled !== 'boolean' || typeof settings.checkOnStartup !== 'boolean' || !isUpdateIntervalHours(settings.intervalHours)) return null
  return { enabled: settings.enabled, checkOnStartup: settings.checkOnStartup, intervalHours: settings.intervalHours }
}

export function loadUpdateSettings(userDataPath: string): UpdateSettings {
  try {
    return parseUpdateSettings(JSON.parse(readFileSync(join(userDataPath, UPDATE_SETTINGS_FILE_NAME), 'utf8'))) ?? DEFAULT_UPDATE_SETTINGS
  } catch {
    return DEFAULT_UPDATE_SETTINGS
  }
}

export function saveUpdateSettings(userDataPath: string, settings: UpdateSettings): void {
  mkdirSync(userDataPath, { recursive: true })
  const path = join(userDataPath, UPDATE_SETTINGS_FILE_NAME)
  const temporaryPath = `${path}.tmp`
  writeFileSync(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
  renameSync(temporaryPath, path)
}
