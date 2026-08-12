import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type ChartData,
  type ChartOptions
} from 'chart.js'
import { Bar, Line } from 'react-chartjs-2'
import type { CostEstimate, Dashboard, DashboardPeriod } from '../../shared/contracts'
import tokenStatsIcon from '../../../assets/icons/64x64.png'
import './styles.css'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend)

const exactNumber = new Intl.NumberFormat('en-US')
const compactNumber = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
const usdNumber = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const rangeDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const monthDate = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' })
const scanDate = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' })
const periods: Array<{ value: DashboardPeriod; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'thisWeek', label: 'This week' },
  { value: 'lastWeek', label: 'Last week' },
  { value: 'thisMonth', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
  { value: 'last6Months', label: 'Last 6 months' }
]
const chartPalette = ['#67b7ff', '#f4b860', '#63d3a1', '#b79cff', '#f28686', '#58c9c4', '#e797c5', '#c7d36f', '#ff8f66', '#7ea6ff', '#e9c46a', '#90be6d', '#f06aa6', '#57c7e3', '#d8a7ff', '#f28e2b', '#4ecca3', '#ff6b6b', '#8dd3c7', '#c4a7e7']

const tokens = (value: number | null | undefined): number => value ?? 0
const exact = (value: number | null | undefined): string => exactNumber.format(tokens(value))
const compact = (value: number | null | undefined): string => compactNumber.format(tokens(value))
const pricingSnapshotIds = (estimate: CostEstimate): string[] => estimate.pricingSnapshotIds ?? []
const costText = (estimate: CostEstimate): string => estimate.amountUsd !== null ? usdNumber.format(estimate.amountUsd) : pricingSnapshotIds(estimate).length > 0 ? 'Incomplete token data' : 'No reliable estimate'
const costCoverageText = (estimate: CostEstimate): string => estimate.coverage === 'complete' ? `${exact(estimate.pricedEvents)} events priced` : estimate.coverage === 'partial' ? `${exact(estimate.pricedEvents)} of ${exact(estimate.totalEvents)} events priced` : pricingSnapshotIds(estimate).length > 0 ? 'Pricing found · token fields incomplete' : 'No priced events'
const pricingSourceText = (data: Dashboard, estimate: CostEstimate): string => {
  const snapshotIds = estimate.snapshotIds.length > 0 ? estimate.snapshotIds : pricingSnapshotIds(estimate)
  const snapshots = snapshotIds.length === 0 ? [] : data.pricingSnapshots.filter((snapshot) => snapshotIds.includes(snapshot.id))
  return snapshots.length === 0 ? 'No matching pricing snapshot' : snapshots.map((snapshot) => `${snapshot.provider} · checked ${snapshot.verifiedAt}`).join(' · ')
}
const costTitle = (estimate: CostEstimate, data: Dashboard): string => `${costText(estimate)} · ${costCoverageText(estimate)} · ${pricingSourceText(data, estimate)} · estimated API-equivalent cost, not a bill`
const dayKey = (date: Date): string => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const seriesKey = (sourceId: string, model: string): string => `${sourceId}\u0000${model}`
const seriesColor = (index: number): string => chartPalette[index] ?? `hsl(${Math.round((index * 137.508) % 360)} 76% 62%)`
const sourceLabel = (data: Dashboard, sourceId: string): string => data.sources.find((source) => source.sourceId === sourceId)?.label ?? sourceId
const seriesLabel = (data: Dashboard, sourceId: string, model: string): string => `${sourceLabel(data, sourceId)} · ${model}`
const sourceReady = (status: string): boolean => !['error', 'not found', 'not scanned'].includes(status)
const sourceStatusNote = (status: string): string => status === 'otel enabled' ? 'Complete OTel token data is currently selected; session-state remains retained as a fallback.' : status === 'otel file present' ? 'OTel file found, but no complete OTel data is currently selected; session-state fallback may be active.' : status === 'session-state fallback' ? 'Active Copilot records may have output tokens only. Enable the OTel file exporter for input and cache usage.' : status === 'healthy' ? 'Local source scan completed.' : status === 'not found' ? 'Source directory or file was not found.' : status === 'error' ? 'Scan failed. Check source availability and try again.' : 'Run a local scan to check this source.'

function bucketLabels(data: Dashboard): Array<{ bucket: string; label: string }> {
  const start = new Date(data.range.start)
  const end = new Date(data.range.end)
  if (data.period === 'today' || data.period === 'yesterday') {
    return Array.from({ length: 24 }, (_, hour) => {
      const date = new Date(start)
      date.setHours(hour, 0, 0, 0)
      return { bucket: `${dayKey(date)} ${String(hour).padStart(2, '0')}:00`, label: `${String(hour).padStart(2, '0')}:00` }
    })
  }
  if (data.period === 'last6Months') {
    const labels: Array<{ bucket: string; label: string }> = []
    const cursor = new Date(start)
    cursor.setDate(1)
    while (cursor < end) {
      labels.push({ bucket: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`, label: monthDate.format(cursor) })
      cursor.setMonth(cursor.getMonth() + 1)
    }
    return labels
  }
  const labels: Array<{ bucket: string; label: string }> = []
  const cursor = new Date(start)
  while (cursor < end) {
    labels.push({ bucket: dayKey(cursor), label: String(cursor.getDate()) })
    cursor.setDate(cursor.getDate() + 1)
  }
  return labels
}

function humanRange(data: Dashboard): string {
  const start = new Date(data.range.start)
  const end = new Date(data.range.end)
  end.setMilliseconds(end.getMilliseconds() - 1)
  if (data.period === 'today') return `Today · ${rangeDate.format(start)}`
  if (data.period === 'yesterday') return `Yesterday · ${rangeDate.format(start)}`
  if (data.period === 'thisWeek') return `This week · ${rangeDate.format(start)} – ${rangeDate.format(end)}`
  if (data.period === 'lastWeek') return `Last week · ${rangeDate.format(start)} – ${rangeDate.format(end)}`
  return `${rangeDate.format(start)} – ${rangeDate.format(end)}`
}

function App(): React.JSX.Element {
  const [period, setPeriod] = useState<DashboardPeriod>('thisMonth')
  const [data, setData] = useState<Dashboard | null>(null)
  const [scanning, setScanning] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [chartType, setChartType] = useState<'line' | 'bar'>('line')

  const load = async (nextPeriod = period): Promise<void> => {
    setLoading(true)
    try {
      setData(await window.tokenStats.getDashboard(nextPeriod))
    } catch {
      setError('Dashboard data is unavailable.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load(period) }, [period])

  const scan = async (): Promise<void> => {
    setScanning(true)
    setError(null)
    try {
      const result = await window.tokenStats.scanAll()
      if (!result.ok) setError(result.error ?? 'Scan failed.')
      await load(period)
    } catch {
      setError('Scan failed. Check source availability and try again.')
    } finally {
      setScanning(false)
    }
  }

  if (!data && loading) return <main className="loading">Loading local usage data…</main>
  if (!data) return <main className="loading" role="alert">Dashboard data is unavailable.</main>

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand">
        <img src={tokenStatsIcon} alt="" width="40" height="40" />
        <div><h1>TokenStats</h1><p>Local usage metadata only — no prompt or response content stored.</p></div>
      </div>
      <div className="header-actions">
        <span className="source-summary">{data.sources.filter((source) => sourceReady(source.status)).length} of {data.sources.length} sources ready</span>
        <button className="scan-button" onClick={() => void scan()} disabled={scanning} aria-busy={scanning}>{scanning ? 'Scanning local sources…' : 'Scan local sources'}</button>
      </div>
    </header>

    {error && <p className="error" role="alert">{error}</p>}
    <section className="period-row" aria-label="Usage period">
      <div className="segmented-control">
        {periods.map((option) => <button key={option.value} onClick={() => setPeriod(option.value)} aria-pressed={period === option.value}>{option.label}</button>)}
      </div>
      {loading && <span className="refreshing" aria-live="polite">Refreshing data…</span>}
    </section>

    {data.eventCount === 0 ? <EmptyState scanning={scanning} onScan={scan} /> : <DashboardView data={data} chartType={chartType} setChartType={setChartType} />}
    <SourceFooter data={data} />
  </main>
}

function EmptyState({ scanning, onScan }: { scanning: boolean; onScan: () => Promise<void> }): React.JSX.Element {
  return <section className="empty-state"><p className="section-kicker">No usage recorded for this period</p><h2>Ready for a first private scan</h2><p>Scan local Codex, Claude Code, and GitHub Copilot/local assistant histories to import token metadata. TokenStats never stores prompt or response content.</p><button className="scan-button" onClick={() => void onScan()} disabled={scanning}>{scanning ? 'Scanning local sources…' : 'Scan local sources'}</button></section>
}

function DashboardView({ data, chartType, setChartType }: { data: Dashboard; chartType: 'line' | 'bar'; setChartType: (type: 'line' | 'bar') => void }): React.JSX.Element {
  const labels = useMemo(() => bucketLabels(data), [data])
  const modelTotals = useMemo(() => [...data.modelTotals].sort((a, b) => tokens(b.totalTokens) - tokens(a.totalTokens) || a.sourceId.localeCompare(b.sourceId) || a.model.localeCompare(b.model)), [data])
  const series = useMemo(() => {
    const seen = new Map<string, { sourceId: string; model: string }>()
    for (const item of [...modelTotals, ...data.trend]) seen.set(seriesKey(item.sourceId, item.model), { sourceId: item.sourceId, model: item.model })
    return [...seen.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, value]) => value)
  }, [modelTotals, data.trend])
  const seriesColors = useMemo(() => new Map(series.map((item, index) => [seriesKey(item.sourceId, item.model), seriesColor(index)])), [series])
  const lineChartData = useMemo<ChartData<'line'>>(() => ({
    labels: labels.map((item) => item.label),
    datasets: series.map(({ sourceId, model }) => ({
      label: seriesLabel(data, sourceId, model),
      data: labels.map(({ bucket }) => tokens(data.trend.find((item) => item.sourceId === sourceId && item.model === model && item.bucket === bucket)?.totalTokens)),
      borderColor: seriesColors.get(seriesKey(sourceId, model)), backgroundColor: seriesColors.get(seriesKey(sourceId, model)), borderWidth: 2, pointRadius: 3, pointHoverRadius: 5, tension: 0.3
    }))
  }), [data, labels, series, seriesColors])
  const barChartData = useMemo<ChartData<'bar'>>(() => ({
    labels: labels.map((item) => item.label),
    datasets: series.map(({ sourceId, model }) => ({
      label: seriesLabel(data, sourceId, model),
      data: labels.map(({ bucket }) => tokens(data.trend.find((item) => item.sourceId === sourceId && item.model === model && item.bucket === bucket)?.totalTokens)),
      borderColor: seriesColors.get(seriesKey(sourceId, model)), backgroundColor: seriesColors.get(seriesKey(sourceId, model)), borderWidth: 1, borderRadius: 3, maxBarThickness: 28
    }))
  }), [data, labels, series, seriesColors])
  const chartOptions = useMemo(() => ({
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${exact(context.parsed.y)} tokens` } } },
    scales: {
      x: { grid: { color: 'rgba(171, 194, 222, 0.09)' }, ticks: { color: '#9dacc0', maxRotation: 0, autoSkip: true, maxTicksLimit: data.period === 'today' || data.period === 'yesterday' ? 8 : data.period === 'last6Months' ? 6 : 10 } },
      y: { beginAtZero: true, grid: { color: 'rgba(171, 194, 222, 0.12)' }, border: { display: false }, ticks: { color: '#9dacc0', callback: (value) => compact(Number(value)) } }
    }
  }), [data.period])
  const lineOptions = chartOptions as ChartOptions<'line'>
  const barOptions = chartOptions as ChartOptions<'bar'>

  return <>
    <section className="summary" aria-labelledby="period-summary"><div><p className="section-kicker" id="period-summary">Reported total</p><strong>{exact(data.totals.totalTokens)}</strong><span>tokens</span><p className="range-label">{humanRange(data)} <span aria-label="Reported tokens; cached input may be included">· reported tokens · cached input may be included</span></p></div><dl><div><dt>Events</dt><dd>{exact(data.eventCount)}</dd></div><div><dt>Sessions</dt><dd>{exact(data.sessionCount)}</dd></div><div><dt>Active days</dt><dd>{exact(data.activeDayCount)}</dd></div><div className={`summary-cost is-${data.estimatedCost.coverage}`}><dt>Est. API-equivalent cost</dt><dd title={costTitle(data.estimatedCost, data)}>{costText(data.estimatedCost)}</dd><span>{costCoverageText(data.estimatedCost)} · {pricingSourceText(data, data.estimatedCost)}</span></div></dl></section>
    <section className="analytics-grid">
      <article className="chart-panel"><div className="panel-heading"><div><p className="section-kicker">Usage by model</p><h2>Token activity</h2></div><div className="segmented-control chart-toggle" aria-label="Chart type"><button onClick={() => setChartType('line')} aria-pressed={chartType === 'line'}>Line</button><button onClick={() => setChartType('bar')} aria-pressed={chartType === 'bar'}>Bars</button></div></div><div className="chart-frame" role="img" aria-label={`Token activity by model for ${humanRange(data)}. The model breakdown below provides the exact values.`}>{chartType === 'line' ? <Line data={lineChartData} options={lineOptions} /> : <Bar data={barChartData} options={barOptions} />}</div></article>
      <ModelBreakdown data={data} models={modelTotals} total={tokens(data.totals.totalTokens)} colors={seriesColors} />
    </section>
    <section className="token-breakdown" aria-labelledby="token-breakdown"><div><p className="section-kicker">Reported fields</p><h2 id="token-breakdown">Token breakdown</h2></div><div className="category-list">{data.categories.map((category) => <div key={category.category}><span>{category.category}</span><strong title={`${exact(category.tokens)} tokens`}>{exact(category.tokens)}</strong></div>)}</div><p>Categories may overlap. The period total uses the reported total.</p></section>
  </>
}

function ModelBreakdown({ data, models, total, colors }: { data: Dashboard; models: Dashboard['modelTotals']; total: number; colors: Map<string, string> }): React.JSX.Element {
  return <article className="model-panel"><div className="panel-heading"><div><p className="section-kicker">Model breakdown</p><h2>Where tokens went</h2></div></div><div className="model-list">{models.map((model) => { const value = tokens(model.totalTokens); const share = total > 0 ? (value / total) * 100 : 0; return <div className="model-row" key={`${model.model}-${model.sourceId}`}><span className="model-dot" style={{ backgroundColor: colors.get(seriesKey(model.sourceId, model.model)) }} aria-hidden="true" /><div className="model-name"><strong>{seriesLabel(data, model.sourceId, model.model)}</strong><span>{exact(model.eventCount)} {model.eventCount === 1 ? 'event' : 'events'} · {share.toFixed(1)}%</span></div><div className="model-value"><strong title={`${exact(value)} tokens`}>{exact(value)}</strong><span>{compact(value)} tokens</span><span className={`model-cost is-${model.estimatedCost.coverage}`} title={costTitle(model.estimatedCost, data)}>{costText(model.estimatedCost)}</span></div></div> })}</div></article>
}

function SourceFooter({ data }: { data: Dashboard }): React.JSX.Element {
  return <footer className="source-footer" aria-label="Local source status"><p className="section-kicker">Local source status</p><div className="source-status-list">{data.sources.map((source) => <section className="source-status" key={source.sourceId}><div><strong>{source.label}</strong><span className={`source-indicator is-${source.status.replaceAll(' ', '-')}`}>{source.status}</span></div><span>{source.lastSuccessfulScan ? `Last successful scan ${scanDate.format(new Date(source.lastSuccessfulScan))}` : 'Not scanned yet'}</span><span>{exact(source.filesScanned)} files · {exact(source.eventsImported)} new events</span><small>{sourceStatusNote(source.status)}</small>{source.warnings.length > 0 && <div className="warnings" role="status">{source.warnings.map((warning, index) => <span key={`${warning.message}-${index}`}>{warning.message}{warning.count > 1 ? ` (${warning.count})` : ''}</span>)}</div>}</section>)}</div></footer>
}

createRoot(document.getElementById('root')!).render(<App />)
