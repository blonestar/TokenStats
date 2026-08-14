import { describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadUpdateSettings, parseUpdateSettings, saveUpdateSettings, UPDATE_SETTINGS_FILE_NAME } from '../src/main/update-settings'

describe('update settings', () => {
  it('uses enabled startup checks and a six-hour default when no file exists', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tokenstats-update-settings-'))
    try {
      expect(loadUpdateSettings(directory)).toEqual({ enabled: true, checkOnStartup: true, intervalHours: 6 })
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('persists validated settings atomically under userData', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tokenstats-update-settings-'))
    try {
      const settings = { enabled: false, checkOnStartup: false, intervalHours: 24 as const }
      saveUpdateSettings(directory, settings)
      expect(existsSync(join(directory, UPDATE_SETTINGS_FILE_NAME))).toBe(true)
      expect(loadUpdateSettings(directory)).toEqual(settings)
      expect(readFileSync(join(directory, UPDATE_SETTINGS_FILE_NAME), 'utf8')).toContain('"intervalHours": 24')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('rejects malformed settings instead of passing them to the updater', () => {
    expect(parseUpdateSettings({ enabled: true, checkOnStartup: true, intervalHours: 2 })).toBeNull()
    expect(parseUpdateSettings({ enabled: 'yes', checkOnStartup: true, intervalHours: 6 })).toBeNull()
    expect(parseUpdateSettings(null)).toBeNull()
  })
})
