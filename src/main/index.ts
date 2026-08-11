import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import type { ScanResult, ScanSourceResult } from '../shared/contracts'
import { TokenDatabase } from './database'
import type { ProviderSource } from './ingestion/contracts'
import { providerMigrations, currentSources as discoverCurrentSources, sourceDefinitions } from './providers/registry'
export { sourceRoot } from './providers/discovery'

let database: TokenDatabase | undefined
let scanRunning = false
const MIN_ZOOM_FACTOR = 0.8
const MAX_ZOOM_FACTOR = 1.5
const ZOOM_STEP = 0.1
type Source = ProviderSource
type ZoomShortcutInput = { type: string; key: string; code: string; control: boolean; meta: boolean; alt: boolean }
type ZoomAction = 'in' | 'out' | 'reset'

export function zoomShortcutAction(input: ZoomShortcutInput): ZoomAction | undefined {
  if (input.type !== 'keyDown' || (!input.control && !input.meta) || input.alt) return undefined
  if (input.key === '+' || input.key === '=' || input.key === 'Add' || input.code === 'NumpadAdd') return 'in'
  if (input.key === '-' || input.key === 'Subtract' || input.code === 'NumpadSubtract') return 'out'
  if (input.key === '0' || input.code === 'Digit0' || input.code === 'Numpad0') return 'reset'
  return undefined
}

export function nextZoomFactor(action: ZoomAction, current: number): number {
  if (action === 'reset') return 1
  const change = action === 'in' ? ZOOM_STEP : -ZOOM_STEP
  return Math.min(MAX_ZOOM_FACTOR, Math.max(MIN_ZOOM_FACTOR, Math.round((current + change) * 100) / 100))
}

export function currentSources(home?: string, env?: NodeJS.ProcessEnv): Source[] { return discoverCurrentSources(home, env) }

export function scanAllSources(db: TokenDatabase, sources = currentSources()): ScanResult {
  const results: ScanSourceResult[] = []; let filesScanned = 0; let eventsImported = 0; let warnings = 0
  for (const source of sources) { const runId = db.beginScan(source.sourceId, source.kind, source.parserVersion); try { const result = source.scan(db, source.root); const status: ScanSourceResult['status'] = result.status ?? (result.files > 0 ? 'success' : 'not found'); const sourceOk = status !== 'error'; db.finishScan(runId, source.sourceId, { ...result, ok: sourceOk, status: sourceOk ? (status === 'success' ? 'healthy' : status) : 'error' }); filesScanned += result.files; eventsImported += result.events; warnings += result.warnings.length; results.push({ sourceId: source.sourceId, providerId: source.providerId, label: source.label, kind: source.kind, status, filesScanned: result.files, eventsImported: result.events, warnings: result.warnings.length, ...(sourceOk ? {} : { error: 'Scan failed. Check source availability and try again.' }) }) } catch { const sourceWarnings = [{ message: `${source.label} scan failed without storing source content.`, count: 1 }]; db.finishScan(runId, source.sourceId, { files: 0, events: 0, warnings: sourceWarnings, ok: false }); warnings += 1; results.push({ sourceId: source.sourceId, providerId: source.providerId, label: source.label, kind: source.kind, status: 'error', filesScanned: 0, eventsImported: 0, warnings: 1, error: 'Scan failed. Check source availability and try again.' }) } }
  return { ok: results.every((result) => result.status !== 'error'), filesScanned, eventsImported, warnings, sources: results }
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1120,
    height: 690,
    minWidth: 900,
    minHeight: 560,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  window.setMenuBarVisibility(false)
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('before-input-event', (event, input) => {
    const action = zoomShortcutAction(input)
    if (!action) return
    event.preventDefault()
    window.webContents.setZoomFactor(nextZoomFactor(action, window.webContents.getZoomFactor()))
  })

  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  if (rendererUrl) {
    void window.loadURL(rendererUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function runAllScan(): ScanResult {
  if (!database) {
    return {
      ok: false,
      filesScanned: 0,
      eventsImported: 0,
      warnings: 0, sources: [],
      error: 'Local database is not ready.'
    }
  }

  if (scanRunning) {
    return {
      ok: false,
      filesScanned: 0,
      eventsImported: 0,
      warnings: 0, sources: [],
      error: 'A scan is already running.'
    }
  }

  scanRunning = true
  try {
    return scanAllSources(database)
  } finally {
    scanRunning = false
  }
}

app.whenReady().then(() => {
  database = new TokenDatabase(
    join(app.getPath('userData'), 'tokenstats.sqlite'),
    sourceDefinitions,
    providerMigrations
  )

  ipcMain.handle('tokenstats:getDashboard', (_event, period: unknown) => database?.dashboard(period))
  ipcMain.handle('tokenstats:scanAll', runAllScan)

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => database?.close())
