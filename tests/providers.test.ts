import { describe, expect, it } from 'vitest'
import { currentSources, providerModules, sourceDefinitions } from '../src/main/providers/registry'

describe('provider registry', () => {
  it('keeps module, source, and provider identities unique', () => {
    expect(new Set(providerModules.map((provider) => provider.id)).size).toBe(providerModules.length)
    expect(new Set(sourceDefinitions.map((source) => source.sourceId)).size).toBe(sourceDefinitions.length)
    expect(providerModules.map((provider) => provider.definition.providerId)).toEqual(providerModules.map((provider) => provider.id))
    const migrationKeys = providerModules.flatMap((provider) => (provider.migrations ?? []).map((migration) => `${migration.id}@${migration.version}`))
    expect(new Set(migrationKeys).size).toBe(migrationKeys.length)
  })

  it('discovers all current providers through the registry', () => {
    const sources = currentSources('/current-user', {
      CLAUDE_CONFIG_DIR: '/claude-config',
      COPILOT_HOME: '/copilot-home',
      COPILOT_OTEL_FILE_EXPORTER_PATH: '/copilot-otel.jsonl'
    } as NodeJS.ProcessEnv)

    expect(sources.map((source) => ({ providerId: source.providerId, sourceId: source.sourceId, parserVersion: source.parserVersion }))).toEqual([
      { providerId: 'codex', sourceId: 'codex-current-user', parserVersion: 'codex-jsonl-v3' },
      { providerId: 'claude', sourceId: 'claude-current-user', parserVersion: 'claude-jsonl-v2' },
      { providerId: 'copilot', sourceId: 'copilot-current-user', parserVersion: 'copilot-events-v3-otel' }
    ])
    expect(sources.map((source) => source.root)).toEqual([
      '/current-user/.codex/sessions',
      '/claude-config/projects',
      '/copilot-home/session-state'
    ])
    expect(sources.every((source) => typeof source.scan === 'function')).toBe(true)
  })
})
