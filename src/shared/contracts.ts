export type TokenUsage = { inputTokens: number | null; outputTokens: number | null; cachedInputTokens: number | null; cacheWriteInputTokens: number | null; reasoningOutputTokens: number | null; totalTokens: number | null }
export type Warning = { message: string; count: number }
export type CostCoverage = 'complete' | 'partial' | 'none'
export type CostEstimate = { amountUsd: number | null; currency: string; kind: 'estimated' | 'unknown'; coverage: CostCoverage; pricedEvents: number; totalEvents: number; snapshotIds: string[] }
export type PricingSnapshotInfo = { id: string; provider: string; product: string; verifiedAt: string; currency: string; billingMode: string }
export type DashboardPeriod = 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'last6Months'
export type DashboardRange = { start: string; end: string; startLabel: string; endLabel: string; label: string }
export type DashboardTrend = TokenUsage & { bucket: string; model: string; sourceId: string; eventCount: number }
export type DashboardModelTotal = TokenUsage & { model: string; sourceId: string; eventCount: number; estimatedCost: CostEstimate }
export type DashboardSource = { sourceId: string; label: string; status: string; lastSuccessfulScan: string | null; filesScanned: number; eventsImported: number; warnings: Warning[] }
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
export type ScanSourceResult = { sourceId: string; label: string; kind: 'codex' | 'claude' | 'copilot'; status: 'success' | 'not found' | 'error'; filesScanned: number; eventsImported: number; warnings: number; error?: string }
export type ScanResult = { ok: boolean; filesScanned: number; eventsImported: number; warnings: number; sources: ScanSourceResult[]; error?: string }
export interface TokenStatsApi { getDashboard(period?: DashboardPeriod): Promise<Dashboard>; scanAll(): Promise<ScanResult> }
