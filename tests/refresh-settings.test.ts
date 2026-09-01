import { describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadRefreshSettings, parseRefreshSettings, saveRefreshSettings, REFRESH_SETTINGS_FILE_NAME } from '../src/main/refresh-settings'

describe('refresh settings', () => {
  it('uses enabled one-minute refresh by default', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tokenstats-refresh-settings-'))
    try {
      expect(loadRefreshSettings(directory)).toEqual({ enabled: true, intervalMinutes: 1 })
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('persists validated settings atomically under userData', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tokenstats-refresh-settings-'))
    try {
      const settings = { enabled: false, intervalMinutes: 15 as const }
      saveRefreshSettings(directory, settings)
      expect(existsSync(join(directory, REFRESH_SETTINGS_FILE_NAME))).toBe(true)
      expect(loadRefreshSettings(directory)).toEqual(settings)
      expect(readFileSync(join(directory, REFRESH_SETTINGS_FILE_NAME), 'utf8')).toContain('"intervalMinutes": 15')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('rejects malformed, fractional, and unsupported intervals', () => {
    expect(parseRefreshSettings({ enabled: true, intervalMinutes: 0 })).toBeNull()
    expect(parseRefreshSettings({ enabled: true, intervalMinutes: 0.5 })).toBeNull()
    expect(parseRefreshSettings({ enabled: true, intervalMinutes: 2 })).toBeNull()
    expect(parseRefreshSettings({ enabled: 'yes', intervalMinutes: 1 })).toBeNull()
    expect(parseRefreshSettings(null)).toBeNull()
  })
})
