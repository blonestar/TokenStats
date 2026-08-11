import { describe, expect, it } from 'vitest'
import Ajv from 'ajv/dist/2020.js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SOURCE_ID as CODEX_SOURCE_ID } from '../src/main/codex'
import { estimateEventCost, selectLatestSnapshotForSource, summarizeCosts } from '../src/main/pricing'

const catalog = JSON.parse(readFileSync(join(__dirname, '..', 'pricing', 'api-pricing.json'), 'utf8'))
const schema = JSON.parse(readFileSync(join(__dirname, '..', 'pricing', 'api-pricing.schema.json'), 'utf8'))

const event = (overrides: Partial<Parameters<typeof estimateEventCost>[0]> = {}): Parameters<typeof estimateEventCost>[0] => ({
  sourceId: CODEX_SOURCE_ID,
  model: 'gpt-5.6-sol',
  inputTokens: 100,
  outputTokens: 25,
  cachedInputTokens: 5,
  cacheWriteInputTokens: null,
  reasoningOutputTokens: 7,
  ...overrides
})

describe('pricing estimates', () => {
  it('selects the latest reviewed snapshot when multiple snapshots map one source', () => {
    const snapshots = [
      { id: 'codex-2026-01', sourceIds: ['codex-current-user'], verifiedAt: '2026-01-01', effectiveFrom: null },
      { id: 'codex-2026-08', sourceIds: ['codex-current-user'], verifiedAt: '2026-08-11', effectiveFrom: '2026-08-01' }
    ] as const
    expect(selectLatestSnapshotForSource(snapshots, 'codex-current-user')?.id).toBe('codex-2026-08')
    expect(selectLatestSnapshotForSource(snapshots, 'unknown-source')).toBeUndefined()
  })

  it('validates the complete pricing catalog against its JSON Schema', () => {
    const ajv = new Ajv({ allErrors: true, strict: false }).addFormat('uri', (value: string) => {
      try { return Boolean(new URL(value).protocol) } catch { return false }
    })
    const validator = ajv.compile(schema)
    expect(validator(catalog), validator.errors ? ajv.errorsText(validator.errors) : '').toBe(true)
    const invalidCatalog = JSON.parse(JSON.stringify(catalog))
    invalidCatalog.snapshots[0].sources[0].url = 'not-a-uri'
    expect(validator(invalidCatalog)).toBe(false)
  })

  it('prices a Codex event without double-counting cached or reasoning tokens', () => {
    expect(estimateEventCost(event())).toEqual({ amountUsd: 0.0012275, snapshotId: 'openai-codex-2026-08-11' })
  })

  it('prices a complete Copilot provider-model event from the GitHub reference catalog', () => {
    expect(estimateEventCost(event({ sourceId: 'copilot-current-user', model: 'claude-sonnet-5', inputTokens: 100, cachedInputTokens: 5, outputTokens: 25, reasoningOutputTokens: null }))).toEqual({ amountUsd: 0.000441, snapshotId: 'github-copilot-2026-08-11' })
  })

  it('selects the long-context tier at 272001 input tokens', () => {
    expect(estimateEventCost(event({ inputTokens: 272000, cachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0 }))?.amountUsd).toBe(1.36)
    expect(estimateEventCost(event({ inputTokens: 272001, cachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0 }))?.amountUsd).toBe(2.72001)
  })

  it('fails closed for ambiguous token relationships and non-Codex sources', () => {
    expect(estimateEventCost(event({ inputTokens: 5, cachedInputTokens: 6 }))).toBeNull()
    expect(estimateEventCost(event({ outputTokens: 5, reasoningOutputTokens: 6 }))).toBeNull()
    expect(estimateEventCost(event({ sourceId: 'copilot-current-user', model: 'gpt-5.6' }))).toBeNull()
    expect(estimateEventCost(event({ inputTokens: null }))).toBeNull()
  })

  it('exposes a matching Copilot price when the active snapshot is incomplete', () => {
    const summary = summarizeCosts([event({ sourceId: 'copilot-current-user', model: 'claude-sonnet-5', inputTokens: null, cachedInputTokens: null, outputTokens: 25, reasoningOutputTokens: null })])
    expect(summary.total).toMatchObject({ amountUsd: null, kind: 'unknown', coverage: 'none', pricedEvents: 0, totalEvents: 1, snapshotIds: [], pricingSnapshotIds: ['github-copilot-2026-08-11'] })
    expect(summary.snapshots).toEqual([{ id: 'github-copilot-2026-08-11', provider: 'github', product: 'copilot', verifiedAt: '2026-08-11', currency: 'USD', billingMode: 'standard' }])
  })

  it('reports partial coverage when a period includes unpriced events', () => {
    const summary = summarizeCosts([
      event(),
      event({ model: 'gpt-5.6-luna', inputTokens: 30, outputTokens: 10, cachedInputTokens: null, reasoningOutputTokens: null }),
      event({ sourceId: 'copilot-current-user', model: 'gpt-5.6' })
    ])
    expect(summary.total).toMatchObject({ amountUsd: 0.0012455, kind: 'estimated', coverage: 'partial', pricedEvents: 2, totalEvents: 3, snapshotIds: ['openai-codex-2026-08-11'] })
    expect(summary.bySeries.get(`${CODEX_SOURCE_ID}\u0000gpt-5.6-sol`)).toMatchObject({ coverage: 'complete', pricedEvents: 1, totalEvents: 1 })
    expect(summary.bySeries.get('copilot-current-user\u0000gpt-5.6')?.kind).toBe('unknown')
  })
})
