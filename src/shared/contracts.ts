export type TokenUsage = { inputTokens: number | null; outputTokens: number | null; cachedInputTokens: number | null; cacheWriteInputTokens: number | null; reasoningOutputTokens: number | null; totalTokens: number | null }
export type Warning = { message: string; count: number }
export type CostCoverage = 'complete' | 'partial' | 'none'
export type CostEstimate = { amountUsd: number | null; currency: string; kind: 'estimated' | 'unknown'; coverage: CostCoverage; pricedEvents: number; totalEvents: number; snapshotIds: string[]; pricingSnapshotIds: string[] }
export type PricingSnapshotInfo = { id: string; provider: string; product: string; verifiedAt: string; currency: string; billingMode: string }
export type DashboardPreset = 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'last6Months'
export type DashboardPeriod = DashboardPreset | 'custom'
export type DashboardBucket = 'hour' | 'day' | 'month'
export type CustomDateRange = { startDate: string; endDate: string }
export type DashboardQuery = DashboardPeriod | ({ period: 'custom' } & CustomDateRange)
export type DashboardRange = { start: string; end: string; startLabel: string; endLabel: string; label: string; bucket: DashboardBucket }
export type DashboardTrend = TokenUsage & { bucket: string; model: string; sourceId: string; eventCount: number }
export type DashboardModelTotal = TokenUsage & { model: string; sourceId: string; eventCount: number; estimatedCost: CostEstimate }
export type SourceStatus = 'healthy' | 'otel enabled' | 'otel file present' | 'session-state fallback' | 'not found' | 'error' | 'not scanned'
export type DashboardSource = { sourceId: string; providerId: string; label: string; status: SourceStatus; lastSuccessfulScan: string | null; filesScanned: number; eventsImported: number; warnings: Warning[] }
export type Dashboard = {
  period: DashboardPeriod
  range: DashboardRange
  totals: TokenUsage
  estimatedCost: CostEstimate
  pricingSnapshots: PricingSnapshotInfo[]
  eventCount: number
  sessionCount: number
  activeDayCount: number
  daily: Array<{ day: string; totalTokens: number }>
  trend: DashboardTrend[]
  modelTotals: DashboardModelTotal[]
  categories: Array<{ category: string; tokens: number }>
  sources: DashboardSource[]
}
export type ScanSourceResult = { sourceId: string; providerId: string; label: string; kind: string; status: SourceStatus | 'success'; filesScanned: number; eventsImported: number; warnings: number; error?: string }
export type ScanResult = { ok: boolean; filesScanned: number; eventsImported: number; warnings: number; sources: ScanSourceResult[]; error?: string }
export type ResetDatabaseResult = { ok: boolean; cancelled?: boolean; backupName?: string; eventsBackedUp?: number; reimport?: ScanResult; error?: string }
export type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'installing' | 'error' | 'unsupported'
export const UPDATE_INTERVAL_HOURS = [1, 6, 12, 24] as const
export type UpdateIntervalHours = typeof UPDATE_INTERVAL_HOURS[number]
export type UpdateSettings = { enabled: boolean; checkOnStartup: boolean; intervalHours: UpdateIntervalHours }
export const DEFAULT_UPDATE_SETTINGS: UpdateSettings = { enabled: true, checkOnStartup: true, intervalHours: 6 }
export type UpdateState = { status: UpdateStatus; version: string | null; progress: number | null; message: string | null; canInstall: boolean; settings: UpdateSettings; lastCheckedAt: string | null; nextCheckAt: string | null }
export interface TokenStatsApi {
  getDashboard(query?: DashboardQuery): Promise<Dashboard>
  getVersion(): Promise<string>
  scanAll(): Promise<ScanResult>
  resetDatabase(): Promise<ResetDatabaseResult>
  getUpdateState(): Promise<UpdateState>
  setUpdateSettings(settings: UpdateSettings): Promise<UpdateState>
  checkForUpdates(): Promise<UpdateState>
  downloadUpdate(): Promise<UpdateState>
  installUpdate(): Promise<UpdateState>
  onUpdateState(listener: (state: UpdateState) => void): () => void
}
