import { describe, expect, it } from 'vitest'
import { SOURCE_ID as CODEX_SOURCE_ID } from '../src/main/codex'
import { estimateEventCost, summarizeCosts } from '../src/main/pricing'

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
  it('prices a Codex event without double-counting cached or reasoning tokens', () => {
    expect(estimateEventCost(event())).toEqual({ amountUsd: 0.0012275, snapshotId: 'openai-codex-2026-08-11' })
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
