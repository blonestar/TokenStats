import { app, BrowserWindow, ipcMain } from 'electron'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import type { ScanResult, ScanSourceResult, Warning } from '../shared/contracts'
import { PARSER_VERSION as CODEX_PARSER_VERSION, SOURCE_ID as CODEX_SOURCE_ID, scanCodex } from './codex'
import { PARSER_VERSION as CLAUDE_PARSER_VERSION, SOURCE_ID as CLAUDE_SOURCE_ID, scanClaude } from './claude'
import { PARSER_VERSION as COPILOT_PARSER_VERSION, SOURCE_ID as COPILOT_SOURCE_ID, scanCopilot } from './copilot'
import { TokenDatabase } from './database'

let database: TokenDatabase | undefined
let scanRunning = false
const MIN_ZOOM_FACTOR = 0.8
const MAX_ZOOM_FACTOR = 1.5
const ZOOM_STEP = 0.1
type Source = { sourceId: string; label: string; kind: ScanSourceResult['kind']; parserVersion: string; root: string; scan: (db: TokenDatabase, root: string) => { files: number; events: number; warnings: Warning[] } }
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

export function sourceRoot(override: string | undefined, fallback: string): string { return override && isAbsolute(override) ? override : fallback }
export function currentSources(home = homedir(), env = process.env): Source[] { return [
  { sourceId: CODEX_SOURCE_ID, label: 'Codex', kind: 'codex', parserVersion: CODEX_PARSER_VERSION, root: join(home, '.codex', 'sessions'), scan: scanCodex },
  { sourceId: CLAUDE_SOURCE_ID, label: 'Claude Code', kind: 'claude', parserVersion: CLAUDE_PARSER_VERSION, root: join(sourceRoot(env.CLAUDE_CONFIG_DIR, join(home, '.claude')), 'projects'), scan: scanClaude },
  { sourceId: COPILOT_SOURCE_ID, label: 'GitHub Copilot', kind: 'copilot', parserVersion: COPILOT_PARSER_VERSION, root: join(sourceRoot(env.COPILOT_HOME, join(home, '.copilot')), 'session-state'), scan: scanCopilot }
] }

export function scanAllSources(db: TokenDatabase, sources = currentSources()): ScanResult {
  const results: ScanSourceResult[] = []; let filesScanned = 0; let eventsImported = 0; let warnings = 0
  for (const source of sources) { const runId = db.beginScan(source.sourceId, source.kind, source.parserVersion); try { const result = source.scan(db, source.root); const status: ScanSourceResult['status'] = result.files > 0 ? 'success' : 'not found'; db.finishScan(runId, source.sourceId, { ...result, ok: true }); filesScanned += result.files; eventsImported += result.events; warnings += result.warnings.length; results.push({ sourceId: source.sourceId, label: source.label, kind: source.kind, status, filesScanned: result.files, eventsImported: result.events, warnings: result.warnings.length }) } catch { const sourceWarnings = [{ message: `${source.label} scan failed without storing source content.`, count: 1 }]; db.finishScan(runId, source.sourceId, { files: 0, events: 0, warnings: sourceWarnings, ok: false }); warnings += 1; results.push({ sourceId: source.sourceId, label: source.label, kind: source.kind, status: 'error', filesScanned: 0, eventsImported: 0, warnings: 1, error: 'Scan failed. Check source availability and try again.' }) } }
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
    join(app.getPath('userData'), 'tokenstats.sqlite')
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
