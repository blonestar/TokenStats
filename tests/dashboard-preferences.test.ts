import { describe, expect, it } from 'vitest'
import { loadDashboardPreferences, saveDashboardPreferences, type DashboardPreferences } from '../src/renderer/src/dashboard-preferences'

function createStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) }
  }
}

describe('dashboard preferences', () => {
  it('restores the selected period and chart type', () => {
    const storage = createStorage()
    const preferences: DashboardPreferences = { period: 'last6Months', chartType: 'bar' }

    saveDashboardPreferences(preferences, storage)

    expect(loadDashboardPreferences(storage)).toEqual(preferences)
  })

  it('falls back independently for malformed preference fields', () => {
    const storage = createStorage()
    storage.setItem('tokenstats.dashboard-preferences', JSON.stringify({ period: 'invalid', chartType: 'bar' }))

    expect(loadDashboardPreferences(storage)).toEqual({ period: 'thisMonth', chartType: 'bar' })
  })

  it('falls back to defaults for malformed stored JSON', () => {
    const storage = createStorage()
    storage.setItem('tokenstats.dashboard-preferences', '{not-json')

    expect(loadDashboardPreferences(storage)).toEqual({ period: 'thisMonth', chartType: 'line' })
  })
})
