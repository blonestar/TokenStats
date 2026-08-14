import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: never[]) => unknown>()
  let beforeQuit: (() => void) | undefined
  const app = {
    whenReady: vi.fn(() => Promise.resolve()),
    isPackaged: true,
    getPath: vi.fn(),
    getAppPath: vi.fn(() => process.cwd()),
    getVersion: vi.fn(() => 'test-version'),
    on: vi.fn((event: string, callback: () => void) => { if (event === 'before-quit') beforeQuit = callback }),
    quit: vi.fn()
  }
  class FakeBrowserWindow {
    static getAllWindows = vi.fn(() => [])
    webContents = { setWindowOpenHandler: vi.fn(), on: vi.fn(), getZoomFactor: vi.fn(() => 1), setZoomFactor: vi.fn(), loadURL: vi.fn(), loadFile: vi.fn(), send: vi.fn() }
    setMenuBarVisibility = vi.fn()
    on = vi.fn()
    isVisible = vi.fn(() => true)
    isMinimized = vi.fn(() => false)
    show = vi.fn()
    hide = vi.fn()
    focus = vi.fn()
    restore = vi.fn()
    loadURL = vi.fn()
    loadFile = vi.fn()
  }
  class FakeTray {
    setToolTip = vi.fn()
    setContextMenu = vi.fn()
    on = vi.fn()
    destroy = vi.fn()
  }
  const Menu = { buildFromTemplate: vi.fn((template: unknown) => ({ template })) }
  const nativeImage = { createFromPath: vi.fn((path: string) => ({ path })) }
  const updateListeners = new Map<string, (...args: unknown[]) => void>()
  const autoUpdater = { autoDownload: true, autoInstallOnAppQuit: true, on: vi.fn((event: string, listener: (...args: unknown[]) => void) => { updateListeners.set(event, listener); return autoUpdater }), checkForUpdates: vi.fn(async () => undefined), downloadUpdate: vi.fn(async () => undefined), quitAndInstall: vi.fn(), emit: (event: string, ...args: unknown[]) => updateListeners.get(event)?.(...args) }
  return { app, beforeQuit: () => beforeQuit?.(), dialog: { showMessageBox: vi.fn() }, handlers, ipcMain: { handle: vi.fn((channel: string, handler: (...args: never[]) => unknown) => handlers.set(channel, handler)) }, BrowserWindow: FakeBrowserWindow, Tray: FakeTray, Menu, nativeImage, autoUpdater }
})

vi.mock('electron', () => ({ app: mocks.app, BrowserWindow: mocks.BrowserWindow, Tray: mocks.Tray, Menu: mocks.Menu, nativeImage: mocks.nativeImage, dialog: mocks.dialog, ipcMain: mocks.ipcMain }))
vi.mock('electron-updater', () => ({ autoUpdater: mocks.autoUpdater }))

describe('main-process reset IPC', () => {
  let directory: string
  const originalEnvironment = { HOME: process.env.HOME, CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR, COPILOT_HOME: process.env.COPILOT_HOME, COPILOT_OTEL_FILE_EXPORTER_PATH: process.env.COPILOT_OTEL_FILE_EXPORTER_PATH, APPIMAGE: process.env.APPIMAGE }
  let reset: (...args: never[]) => Promise<{ ok: boolean; cancelled?: boolean; backupName?: string; error?: string }>
  let scan: (...args: never[]) => Promise<{ ok: boolean; error?: string }>
  let setUpdateSettings: (event: unknown, settings: unknown) => Promise<{ settings: { enabled: boolean; checkOnStartup: boolean; intervalHours: number } }>
  let install: () => { status: string; canInstall: boolean }

  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'tokenstats-ipc-'))
    process.env.HOME = directory
    process.env.CLAUDE_CONFIG_DIR = join(directory, '.claude')
    process.env.COPILOT_HOME = join(directory, '.copilot')
    process.env.COPILOT_OTEL_FILE_EXPORTER_PATH = join(directory, 'copilot-otel.jsonl')
    const appImagePath = join(directory, 'TokenStats.AppImage')
    process.env.APPIMAGE = appImagePath
    writeFileSync(appImagePath, 'test appimage')
    chmodSync(appImagePath, 0o755)
    mocks.app.getPath.mockReturnValue(directory)
    await import('../src/main/index')
    await new Promise<void>((resolve) => setImmediate(resolve))
    reset = mocks.handlers.get('tokenstats:resetDatabase') as typeof reset
    scan = mocks.handlers.get('tokenstats:scanAll') as typeof scan
    setUpdateSettings = mocks.handlers.get('tokenstats:setUpdateSettings') as typeof setUpdateSettings
    install = mocks.handlers.get('tokenstats:installUpdate') as typeof install
  })

  afterAll(() => {
    mocks.beforeQuit()
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    rmSync(directory, { recursive: true, force: true })
  })

  it('keeps confirmation and scan/reset exclusion in the main process', async () => {
    let release: ((value: { response: number }) => void) | undefined
    mocks.dialog.showMessageBox.mockImplementationOnce(() => new Promise<{ response: number }>((resolve) => { release = resolve }))
    const pendingReset = reset()
    await new Promise<void>((resolve) => setImmediate(resolve))

    expect(mocks.dialog.showMessageBox).toHaveBeenCalledWith(expect.objectContaining({ type: 'warning', buttons: ['Cancel', 'Reset and re-import'] }))
    expect(await scan()).toMatchObject({ ok: false, error: 'The database is being reset.' })
    expect(await reset()).toMatchObject({ ok: false, error: 'The database is already being reset.' })
    release!({ response: 0 })
    await expect(pendingReset).resolves.toEqual({ ok: false, cancelled: true })
  })

  it('creates the backup through the confirmed IPC path', async () => {
    mocks.dialog.showMessageBox.mockResolvedValueOnce({ response: 1 })
    const result = await reset()
    expect(result).toMatchObject({ ok: true, eventsBackedUp: 0, reimport: { ok: true } })
    expect(existsSync(join(directory, 'backups', `${result.backupName}.json`))).toBe(true)
  })

  it('blocks install while reset owns the main-process lock', async () => {
    mocks.autoUpdater.emit('update-available', { version: '0.1.1' })
    await mocks.handlers.get('tokenstats:downloadUpdate')?.()
    mocks.autoUpdater.emit('update-downloaded', { version: '0.1.1' })

    let release: ((value: { response: number }) => void) | undefined
    mocks.dialog.showMessageBox.mockImplementationOnce(() => new Promise<{ response: number }>((resolve) => { release = resolve }))
    const pendingReset = reset()
    await new Promise<void>((resolve) => setImmediate(resolve))

    expect(install()).toMatchObject({ status: 'downloaded', canInstall: false })
    expect(mocks.autoUpdater.quitAndInstall).not.toHaveBeenCalled()
    release!({ response: 0 })
    await pendingReset
  })

  it('persists validated update preferences through the main-process IPC', async () => {
    const result = await setUpdateSettings(undefined, { enabled: false, checkOnStartup: false, intervalHours: 24 })

    expect(result.settings).toEqual({ enabled: false, checkOnStartup: false, intervalHours: 24 })
    expect(readFileSync(join(directory, 'update-settings.json'), 'utf8')).toContain('"intervalHours": 24')

    await setUpdateSettings(undefined, { enabled: true, checkOnStartup: true, intervalHours: 6 })
  })
})
