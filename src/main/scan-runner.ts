/// <reference types="electron-vite/node" />
import type { ScanResult } from '../shared/contracts'
import createScanWorker from './scan-worker?nodeWorker'

// Scanning reads every source file synchronously; a worker keeps the main process free to answer dashboard IPC meanwhile.
export function scanInWorker(databaseFile: string): Promise<ScanResult> {
  return new Promise((resolve, reject) => {
    let settled = false
    const worker = createScanWorker({ workerData: { databaseFile } })
    worker.once('message', (result: ScanResult) => { settled = true; resolve(result) })
    worker.once('error', (error) => { settled = true; reject(error) })
    worker.once('exit', (code) => { if (!settled) reject(new Error(`Scan worker exited with code ${code} before reporting a result.`)) })
  })
}
