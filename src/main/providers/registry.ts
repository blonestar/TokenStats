import { homedir } from 'node:os'
import { claudeProvider } from '../claude'
import { codexProvider } from '../codex'
import { copilotProvider } from '../copilot'
import type { DiscoveryContext, ProviderMigration, ProviderSource, SourceDefinition } from '../ingestion/contracts'
import type { ProviderModule } from './contracts'

export const providerModules: readonly ProviderModule[] = [codexProvider, claudeProvider, copilotProvider]
export const sourceDefinitions: readonly SourceDefinition[] = providerModules.map(({ definition }) => definition)
export const providerMigrations: readonly ProviderMigration[] = providerModules.flatMap(({ migrations = [] }) => migrations)

export function currentSources(home = homedir(), env = process.env): ProviderSource[] {
  const context: DiscoveryContext = { home, env }
  return providerModules.flatMap((provider) => provider.discover(context))
}
