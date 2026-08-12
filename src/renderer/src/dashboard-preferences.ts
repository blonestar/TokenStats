import type { CustomDateRange, DashboardPeriod } from '../../shared/contracts'

export type DashboardChartType = 'line' | 'bar' | 'pie'
export type DashboardPreferences = { period: DashboardPeriod; chartType: DashboardChartType; customRange: CustomDateRange }
type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>

const STORAGE_KEY = 'tokenstats.dashboard-preferences'
const DEFAULT_PREFERENCES: DashboardPreferences = { period: 'thisMonth', chartType: 'line', customRange: { startDate: '', endDate: '' } }
const PERIODS: readonly DashboardPeriod[] = ['today', 'yesterday', 'thisWeek', 'lastWeek', 'thisMonth', 'lastMonth', 'last6Months', 'custom']

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const isPeriod = (value: unknown): value is DashboardPeriod => typeof value === 'string' && PERIODS.includes(value as DashboardPeriod)
const isChartType = (value: unknown): value is DashboardChartType => value === 'line' || value === 'bar' || value === 'pie'
const isDateInput = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}
export const isCustomRange = (value: unknown): value is CustomDateRange => isRecord(value) && isDateInput(value.startDate) && isDateInput(value.endDate) && value.startDate <= value.endDate

export function loadDashboardPreferences(storage: PreferenceStorage = window.localStorage): DashboardPreferences {
  try {
    const stored = storage.getItem(STORAGE_KEY)
    if (!stored) return { ...DEFAULT_PREFERENCES }
    const parsed: unknown = JSON.parse(stored)
    if (!isRecord(parsed)) return { ...DEFAULT_PREFERENCES }
    return {
      period: isPeriod(parsed.period) ? parsed.period : DEFAULT_PREFERENCES.period,
      chartType: isChartType(parsed.chartType) ? parsed.chartType : DEFAULT_PREFERENCES.chartType,
      customRange: isCustomRange(parsed.customRange) ? parsed.customRange : { ...DEFAULT_PREFERENCES.customRange }
    }
  } catch {
    return { ...DEFAULT_PREFERENCES }
  }
}

export function saveDashboardPreferences(preferences: DashboardPreferences, storage: PreferenceStorage = window.localStorage): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(preferences))
  } catch {
    // Preferences are optional UI state; a storage failure must not block the dashboard.
  }
}
