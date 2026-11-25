import { vi } from 'vitest'
import type { ScanResult } from '../../src/shared/contracts'
import { TokenDatabase } from '../../src/main/database'
import { scanAllSources } from '../../src/main/scan'

export const scanInWorker = vi.fn(async (databaseFile: string): Promise<ScanResult> => {
  const database = new TokenDatabase(databaseFile)
  try {
    return scanAllSources(database)
  } finally {
    database.close()
  }
})
