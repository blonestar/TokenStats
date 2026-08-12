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
    const preferences: DashboardPreferences = { period: 'last6Months', chartType: 'pie', customRange: { startDate: '2026-08-01', endDate: '2026-08-11' } }

    saveDashboardPreferences(preferences, storage)

    expect(loadDashboardPreferences(storage)).toEqual(preferences)
  })

  it('falls back independently for malformed preference fields', () => {
    const storage = createStorage()
    storage.setItem('tokenstats.dashboard-preferences', JSON.stringify({ period: 'invalid', chartType: 'bar' }))

    expect(loadDashboardPreferences(storage)).toEqual({ period: 'thisMonth', chartType: 'bar', customRange: { startDate: '', endDate: '' } })
  })

  it('falls back to defaults for malformed stored JSON', () => {
    const storage = createStorage()
    storage.setItem('tokenstats.dashboard-preferences', '{not-json')

    expect(loadDashboardPreferences(storage)).toEqual({ period: 'thisMonth', chartType: 'line', customRange: { startDate: '', endDate: '' } })
  })

  it('rejects invalid custom date ranges', () => {
    const storage = createStorage()
    storage.setItem('tokenstats.dashboard-preferences', JSON.stringify({ period: 'custom', chartType: 'line', customRange: { startDate: '2026-02-30', endDate: '2026-02-01' } }))

    expect(loadDashboardPreferences(storage)).toEqual({ period: 'custom', chartType: 'line', customRange: { startDate: '', endDate: '' } })
  })
})
