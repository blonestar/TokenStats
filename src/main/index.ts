import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Tray } from 'electron'
import { join } from 'node:path'
import { DEFAULT_REFRESH_SETTINGS, DEFAULT_UPDATE_SETTINGS, IDLE_SCAN_STATE, type CostEstimate, type RefreshSettings, type ResetDatabaseResult, type ScanReason, type ScanResult, type ScanSourceResult, type ScanState, type UpdateState } from '../shared/contracts'
import { TokenDatabase, type TraySummary } from './database'
import { backupAndClearDatabase } from './database-reset'
import type { ProviderSource } from './ingestion/contracts'
import { providerMigrations, currentSources as discoverCurrentSources, sourceDefinitions } from './providers/registry'
import { loadRefreshSettings, parseRefreshSettings, saveRefreshSettings } from './refresh-settings'
import { RefreshScheduler } from './refresh-scheduler'
import { loadUpdateSettings, parseUpdateSettings, saveUpdateSettings } from './update-settings'
import { createUpdateController, initialUpdateState, isLinuxAppImageUpdateSupported, type UpdateController } from './updater'
export { sourceRoot } from './providers/discovery'

let database: TokenDatabase | undefined
let scanRunning = false
let resetRunning = false
let mainWindow: BrowserWindow | undefined
let tray: Tray | undefined
let updateController: UpdateController | undefined
let updateSettings = DEFAULT_UPDATE_SETTINGS
let refreshScheduler: RefreshScheduler | undefined
let refreshSettings: RefreshSettings = DEFAULT_REFRESH_SETTINGS
let scanState: ScanState = IDLE_SCAN_STATE
let startupScanStarted = false
let isQuitting = false
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

function showWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
  updateTrayMenu()
}

function hideWindow(): void {
  mainWindow?.hide()
  updateTrayMenu()
}

function quitApplication(): void {
  if (isQuitting) return
  isQuitting = true
  refreshScheduler?.stop()
  tray?.destroy()
  tray = undefined
  app.quit()
}

function updateMenuItem(state: UpdateState): { label: string; enabled?: boolean; click?: () => void } | undefined {
  if (state.status === 'available') return { label: `Update available — v${state.version ?? 'new version'}`, click: () => { void updateController?.downloadUpdate() } }
  if (state.status === 'downloading') return { label: `Downloading update${state.progress === null ? '…' : `… ${state.progress}%`}`, enabled: false }
  if (state.status === 'downloaded') return { label: state.canInstall ? `Install update and restart${state.version ? ` · v${state.version}` : ''}` : 'Waiting to install…', enabled: state.canInstall, click: () => { updateController?.installUpdate() } }
  if (state.status === 'installing') return { label: 'Installing update…', enabled: false }
  if (state.status === 'error') return { label: 'Update check unavailable — Check again', click: () => { void updateController?.checkForUpdates() } }
  return undefined
}

function publishUpdateState(state: UpdateState): void {
  updateTrayMenu()
  mainWindow?.webContents.send('tokenstats:updateState', state)
}

function publishScanState(nextState: ScanState): void {
  scanState = { ...nextState }
  mainWindow?.webContents.send('tokenstats:scanState', scanState)
}

function publishScanComplete(result: ScanResult): void {
  mainWindow?.webContents.send('tokenstats:scanComplete', result)
  updateTrayTooltip()
}

function formatTokens(value: number): string {
  return value.toLocaleString('en-US')
}

function formatUsd(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function costSuffix(estimate: CostEstimate): string {
  return estimate.amountUsd === null ? '' : ` · est. ${formatUsd(estimate.amountUsd)}`
}

function trayTooltipText(summary: TraySummary | undefined): string {
  if (!summary || summary.eventCount === 0) return 'TokenStats'
  const lines = [
    'TokenStats',
    `Today: ${formatTokens(summary.todayTokens)} tokens${costSuffix(summary.todayCost)}`,
    `This month: ${formatTokens(summary.monthTokens)} tokens${costSuffix(summary.monthCost)}`
  ]
  if (summary.topModels.length > 0) {
    lines.push(`Top models this month: ${summary.topModels.map((model) => `${model.model} (${model.sharePercent}%)`).join(' · ')}`)
  }
  return lines.join('\n')
}

function updateTrayTooltip(): void {
  if (!tray) return
  let summary: TraySummary | undefined
  try {
    summary = database?.traySummary()
  } catch {
    summary = undefined
  }
  tray.setToolTip(trayTooltipText(summary))
}

function updateTrayMenu(): void {
  if (!tray) return
  const visible = Boolean(mainWindow && mainWindow.isVisible() && !mainWindow.isMinimized())
  const update = updateMenuItem(updateController?.getState() ?? initialUpdateState)
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: visible ? 'Hide window' : 'Show window',
      click: () => { if (visible) hideWindow(); else showWindow() }
    },
    ...(update ? [{ type: 'separator' as const }, update] : []),
    { type: 'separator' },
    { label: 'Exit TokenStats', click: quitApplication }
  ]))
}

function createTray(): void {
  if (tray) return
  tray = new Tray(nativeImage.createFromPath(join(app.getAppPath(), 'assets/icons/64x64.png')))
  updateTrayTooltip()
  tray.on('click', showWindow)
  tray.on('right-click', updateTrayMenu)
  updateTrayMenu()
}

function createWindow(): void {
  if (mainWindow) {
    showWindow()
    return
  }

  const window = new BrowserWindow({
    width: 1120,
    height: 690,
    minWidth: 900,
    minHeight: 560,
    icon: join(app.getAppPath(), 'assets/icons/64x64.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow = window

  window.on('close', (event) => {
    if (isQuitting || updateController?.getState().status === 'installing') return
    event.preventDefault()
    hideWindow()
  })
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = undefined
    updateTrayMenu()
  })
  window.on('show', updateTrayMenu)
  window.on('hide', updateTrayMenu)
  window.on('minimize', updateTrayMenu)
  window.on('restore', updateTrayMenu)
  updateTrayMenu()

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

function runAllScan(reason: ScanReason = 'manual'): ScanResult {
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

  if (resetRunning) {
    return {
      ok: false,
      filesScanned: 0,
      eventsImported: 0,
      warnings: 0, sources: [],
      error: 'The database is being reset.'
    }
  }

  scanRunning = true
  publishScanState({ status: 'scanning', reason })
  updateController?.syncInstallability()
  try {
    const result = scanAllSources(database)
    publishScanComplete(result)
    return result
  } finally {
    scanRunning = false
    publishScanState(IDLE_SCAN_STATE)
    updateController?.syncInstallability()
  }
}

function runScheduledScan(): void {
  if (isQuitting || scanRunning || resetRunning) return
  try {
    runAllScan('automatic')
  } catch {
    publishScanComplete({ ok: false, filesScanned: 0, eventsImported: 0, warnings: 1, sources: [], error: 'Automatic refresh failed. Existing dashboard data was kept.' })
  }
}

function startStartupScan(): void {
  if (startupScanStarted || isQuitting || !database) return
  startupScanStarted = true
  try {
    runAllScan('startup')
  } finally {
    refreshScheduler?.start(refreshSettings)
  }
}

async function resetDatabase(): Promise<ResetDatabaseResult> {
  if (!database) return { ok: false, error: 'Local database is not ready.' }
  if (scanRunning) return { ok: false, error: 'A scan is already running. Try again when it finishes.' }
  if (resetRunning) return { ok: false, error: 'The database is already being reset.' }

  resetRunning = true
  publishScanState({ status: 'scanning', reason: 'reset' })
  updateController?.syncInstallability()
  try {
    const confirmation = await dialog.showMessageBox({
      type: 'warning',
      title: 'Reset local database?',
      message: 'Reset imported TokenStats data and re-import from local source logs?',
      detail: 'A verified SQLite backup will be retained first. Source files are not changed. This cannot be undone from the app.',
      buttons: ['Cancel', 'Reset and re-import'],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    })
    if (confirmation.response !== 1) return { ok: false, cancelled: true }
    const reset = await backupAndClearDatabase(database, { userData: app.getPath('userData'), appVersion: app.getVersion() })
    if (!reset.ok) return reset
    try {
      const reimport = scanAllSources(database)
      publishScanComplete(reimport)
      return { ...reset, ok: reimport.ok, reimport, ...(reimport.ok ? {} : { error: 'Database reset succeeded, but re-import reported an error.' }) }
    } catch {
      const reimport: ScanResult = { ok: false, filesScanned: 0, eventsImported: 0, warnings: 1, sources: [], error: 'Re-import failed before a source result was recorded.' }
      return { ...reset, ok: false, reimport, error: `Database reset succeeded, but re-import failed. Verified backup ${reset.backupName ?? 'was'} retained.` }
    }
  } catch {
    return { ok: false, error: 'The database could not be reset. Existing data was kept.' }
  } finally {
    resetRunning = false
    publishScanState(IDLE_SCAN_STATE)
    updateController?.syncInstallability()
  }
}

app.whenReady().then(() => {
  const userDataPath = app.getPath('userData')
  updateSettings = loadUpdateSettings(userDataPath)
  refreshSettings = loadRefreshSettings(userDataPath)
  scanState = { status: 'scanning', reason: 'startup' }
  database = new TokenDatabase(
    join(userDataPath, 'tokenstats.sqlite'),
    sourceDefinitions,
    providerMigrations
  )

  ipcMain.handle('tokenstats:getDashboard', (_event, period: unknown) => database?.dashboard(period))
  ipcMain.handle('tokenstats:getVersion', () => app.getVersion())
  ipcMain.handle('tokenstats:scanAll', () => runAllScan('manual'))
  ipcMain.handle('tokenstats:rendererReady', startStartupScan)
  ipcMain.handle('tokenstats:getScanState', () => ({ ...scanState }))
  ipcMain.handle('tokenstats:getRefreshSettings', () => ({ ...refreshSettings }))
  ipcMain.handle('tokenstats:setRefreshSettings', (_event, value: unknown) => {
    const nextSettings = parseRefreshSettings(value)
    if (!nextSettings) return { ...refreshSettings }
    saveRefreshSettings(userDataPath, nextSettings)
    refreshSettings = nextSettings
    if (startupScanStarted) refreshScheduler?.setSettings(nextSettings)
    return { ...refreshSettings }
  })
  ipcMain.handle('tokenstats:resetDatabase', resetDatabase)
  ipcMain.handle('tokenstats:getUpdateState', () => updateController?.getState() ?? initialUpdateState)
  ipcMain.handle('tokenstats:setUpdateSettings', (_event, value: unknown) => {
    const nextSettings = parseUpdateSettings(value)
    if (!nextSettings) return updateController?.getState() ?? initialUpdateState
    saveUpdateSettings(userDataPath, nextSettings)
    updateSettings = nextSettings
    updateController?.setSettings(nextSettings)
    return updateController?.getState() ?? { ...initialUpdateState, settings: nextSettings }
  })
  ipcMain.handle('tokenstats:checkForUpdates', () => updateController?.checkForUpdates() ?? initialUpdateState)
  ipcMain.handle('tokenstats:downloadUpdate', () => updateController?.downloadUpdate() ?? initialUpdateState)
  ipcMain.handle('tokenstats:installUpdate', () => updateController?.installUpdate() ?? initialUpdateState)

  updateController = createUpdateController({
    enabled: isLinuxAppImageUpdateSupported({ platform: process.platform, isPackaged: app.isPackaged, appImagePath: process.env.APPIMAGE }),
    settings: updateSettings,
    onStateChange: publishUpdateState,
    canInstall: () => !scanRunning && !resetRunning
  })
  refreshScheduler = new RefreshScheduler(runScheduledScan)
  createTray()
  createWindow()
  updateTrayMenu()
  updateController.start()

  app.on('activate', () => {
    if (mainWindow) showWindow()
    else createWindow()
  })
})

app.on('window-all-closed', () => {
  // Closing the window is handled by the BrowserWindow close listener; the tray remains the app's exit surface.
})

app.on('before-quit', () => {
  isQuitting = true
  refreshScheduler?.stop()
  updateController?.stop()
  tray?.destroy()
  tray = undefined
  database?.close()
})
