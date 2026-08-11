import type { DiscoveryContext, ProviderMigration, ProviderSource, SourceDefinition } from '../ingestion/contracts'

export type ProviderModule = {
  id: string
  definition: SourceDefinition
  discover: (context: DiscoveryContext) => ProviderSource[]
  migrations?: readonly ProviderMigration[]
}
