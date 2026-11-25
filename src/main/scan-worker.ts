import { parentPort, workerData } from 'node:worker_threads'
import { TokenDatabase } from './database'
import { scanAllSources } from './scan'

const { databaseFile } = workerData as { databaseFile: string }
const database = new TokenDatabase(databaseFile)
try {
  parentPort?.postMessage(scanAllSources(database))
} finally {
  database.close()
}
