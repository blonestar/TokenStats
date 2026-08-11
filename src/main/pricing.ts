import catalog from '../../pricing/api-pricing.json'
import { SOURCE_ID as CODEX_SOURCE_ID } from './codex'
import type { UsageEvent } from './database'
import type { CostEstimate, PricingSnapshotInfo } from '../shared/contracts'

export const ACTIVE_SNAPSHOT_ID = 'openai-codex-2026-08-11'
export const COPILOT_SNAPSHOT_ID = 'github-copilot-2026-08-11'

type PricingRates = {
  inputTokens?: number
  cachedInputTokens?: number
  cacheWriteInputTokens?: number
  outputTokens?: number
  reasoningOutputTokens?: number
}
type PricingTier = { id: string; minimumInputTokens?: number; maximumInputTokens?: number; rates: PricingRates }
type PricingModel = { modelId: string; matchIds: string[]; tiers: PricingTier[] }
type PricingSnapshot = {
  id: string
  provider: string
  product: string
  verifiedAt: string
  currency: string
  billingMode: string
  unit: { metric: string; quantity: number }
  models: PricingModel[]
}
type PricingCatalog = { format: string; formatVersion: number; snapshots: PricingSnapshot[] }
type PricingEvent = Pick<UsageEvent, 'sourceId' | 'model' | 'inputTokens' | 'outputTokens' | 'cachedInputTokens' | 'cacheWriteInputTokens' | 'reasoningOutputTokens'>
type MutableCost = { amountUsd: number; pricedEvents: number; totalEvents: number; snapshotIds: Set<string>; pricingSnapshotIds: Set<string> }

const pricingCatalog = catalog as PricingCatalog

function snapshotForSource(sourceId: string): PricingSnapshot | undefined {
  if (pricingCatalog.format !== 'tokenstats-api-pricing' || pricingCatalog.formatVersion !== 1) return undefined
  const snapshotId = sourceId === CODEX_SOURCE_ID ? ACTIVE_SNAPSHOT_ID : sourceId === 'copilot-current-user' ? COPILOT_SNAPSHOT_ID : null
  return snapshotId ? pricingCatalog.snapshots.find((snapshot) => snapshot.id === snapshotId) : undefined
}

function snapshotInfo(snapshot: PricingSnapshot): PricingSnapshotInfo {
  return { id: snapshot.id, provider: snapshot.provider, product: snapshot.product, verifiedAt: snapshot.verifiedAt, currency: snapshot.currency, billingMode: snapshot.billingMode }
}

function validCount(value: number | null, required: boolean): number | null {
  if (value === null) return required ? null : 0
  return Number.isSafeInteger(value) && value >= 0 ? value : null
}

function rateValue(value: number | undefined, tokens: number): number | null {
  if (tokens === 0) return 0
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function modelFor(snapshot: PricingSnapshot, modelId: string): PricingModel | undefined {
  return snapshot.models.find((model) => model.matchIds.includes(modelId))
}

function snapshotForEvent(event: PricingEvent): PricingSnapshot | undefined {
  const snapshot = snapshotForSource(event.sourceId)
  return snapshot && modelFor(snapshot, event.model) ? snapshot : undefined
}

function tierFor(model: PricingModel, inputTokens: number): PricingTier | undefined {
  return model.tiers.find((tier) => (tier.minimumInputTokens === undefined || inputTokens >= tier.minimumInputTokens) && (tier.maximumInputTokens === undefined || inputTokens <= tier.maximumInputTokens))
}

export type EventCost = { amountUsd: number; snapshotId: string }

export function estimateEventCost(event: PricingEvent): EventCost | null {
  const snapshot = snapshotForSource(event.sourceId)
  if (!snapshot || snapshot.currency !== 'USD') return null
  const model = modelFor(snapshot, event.model)
  const inputTokens = validCount(event.inputTokens, true)
  const outputTokens = validCount(event.outputTokens, true)
  const cachedInputTokens = validCount(event.cachedInputTokens, false)
  const cacheWriteInputTokens = validCount(event.cacheWriteInputTokens, false)
  const reasoningOutputTokens = validCount(event.reasoningOutputTokens, false)
  if (!model || inputTokens === null || outputTokens === null || cachedInputTokens === null || cacheWriteInputTokens === null || reasoningOutputTokens === null) return null
  if (cachedInputTokens + cacheWriteInputTokens > inputTokens || reasoningOutputTokens > outputTokens) return null
  const tier = tierFor(model, inputTokens)
  if (!tier || snapshot.unit.metric !== 'tokens' || snapshot.unit.quantity <= 0) return null
  const uncachedInputTokens = inputTokens - cachedInputTokens - cacheWriteInputTokens
  const inputRate = rateValue(tier.rates.inputTokens, uncachedInputTokens)
  const cachedRate = rateValue(tier.rates.cachedInputTokens, cachedInputTokens)
  const cacheWriteRate = rateValue(tier.rates.cacheWriteInputTokens, cacheWriteInputTokens)
  const outputRate = rateValue(tier.rates.outputTokens, outputTokens)
  if (inputRate === null || cachedRate === null || cacheWriteRate === null || outputRate === null) return null
  const amountUsd = (uncachedInputTokens * inputRate + cachedInputTokens * cachedRate + cacheWriteInputTokens * cacheWriteRate + outputTokens * outputRate) / snapshot.unit.quantity
  return Number.isFinite(amountUsd) ? { amountUsd, snapshotId: snapshot.id } : null
}

function emptyAggregate(totalEvents = 0): MutableCost {
  return { amountUsd: 0, pricedEvents: 0, totalEvents, snapshotIds: new Set<string>(), pricingSnapshotIds: new Set<string>() }
}

export function costKey(sourceId: string, model: string): string { return `${sourceId}\u0000${model}` }

function publicEstimate(aggregate: MutableCost): CostEstimate {
  return {
    amountUsd: aggregate.pricedEvents > 0 ? aggregate.amountUsd : null,
    currency: 'USD',
    kind: aggregate.pricedEvents > 0 ? 'estimated' : 'unknown',
    coverage: aggregate.pricedEvents === 0 ? 'none' : aggregate.pricedEvents === aggregate.totalEvents ? 'complete' : 'partial',
    pricedEvents: aggregate.pricedEvents,
    totalEvents: aggregate.totalEvents,
    snapshotIds: [...aggregate.snapshotIds].sort(),
    pricingSnapshotIds: [...aggregate.pricingSnapshotIds].sort()
  }
}

export type CostSummary = { total: CostEstimate; bySeries: Map<string, CostEstimate>; snapshots: PricingSnapshotInfo[] }

export function summarizeCosts(events: readonly PricingEvent[]): CostSummary {
  const total = emptyAggregate()
  const bySeries = new Map<string, MutableCost>()
  const snapshots = new Map<string, PricingSnapshotInfo>()
  for (const event of events) {
    total.totalEvents += 1
    const key = costKey(event.sourceId, event.model)
    const series = bySeries.get(key) ?? emptyAggregate()
    series.totalEvents += 1
    const pricingSnapshot = snapshotForEvent(event)
    if (pricingSnapshot) {
      total.pricingSnapshotIds.add(pricingSnapshot.id)
      series.pricingSnapshotIds.add(pricingSnapshot.id)
      snapshots.set(pricingSnapshot.id, snapshotInfo(pricingSnapshot))
    }
    const estimate = estimateEventCost(event)
    if (estimate) {
      total.amountUsd += estimate.amountUsd
      total.pricedEvents += 1
      total.snapshotIds.add(estimate.snapshotId)
      series.amountUsd += estimate.amountUsd
      series.pricedEvents += 1
      series.snapshotIds.add(estimate.snapshotId)
      const snapshot = pricingCatalog.snapshots.find((item) => item.id === estimate.snapshotId)
      if (snapshot) snapshots.set(snapshot.id, snapshotInfo(snapshot))
    }
    bySeries.set(key, series)
  }
  return { total: publicEstimate(total), bySeries: new Map([...bySeries].map(([key, value]) => [key, publicEstimate(value)])), snapshots: [...snapshots.values()] }
}

export function unknownCost(totalEvents = 0): CostEstimate { return publicEstimate(emptyAggregate(totalEvents)) }
