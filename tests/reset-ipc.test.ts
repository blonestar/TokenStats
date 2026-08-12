import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: never[]) => unknown>()
  let beforeQuit: (() => void) | undefined
  const app = {
    whenReady: vi.fn(() => Promise.resolve()),
    getPath: vi.fn(),
    getAppPath: vi.fn(() => process.cwd()),
    getVersion: vi.fn(() => 'test-version'),
    on: vi.fn((event: string, callback: () => void) => { if (event === 'before-quit') beforeQuit = callback }),
    quit: vi.fn()
  }
  class FakeBrowserWindow {
    static getAllWindows = vi.fn(() => [])
    webContents = { setWindowOpenHandler: vi.fn(), on: vi.fn(), getZoomFactor: vi.fn(() => 1), setZoomFactor: vi.fn(), loadURL: vi.fn(), loadFile: vi.fn() }
    setMenuBarVisibility = vi.fn()
    loadURL = vi.fn()
    loadFile = vi.fn()
  }
  return { app, beforeQuit: () => beforeQuit?.(), dialog: { showMessageBox: vi.fn() }, handlers, ipcMain: { handle: vi.fn((channel: string, handler: (...args: never[]) => unknown) => handlers.set(channel, handler)) }, BrowserWindow: FakeBrowserWindow }
})

vi.mock('electron', () => ({ app: mocks.app, BrowserWindow: mocks.BrowserWindow, dialog: mocks.dialog, ipcMain: mocks.ipcMain }))

describe('main-process reset IPC', () => {
  let directory: string
  const originalEnvironment = { HOME: process.env.HOME, CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR, COPILOT_HOME: process.env.COPILOT_HOME, COPILOT_OTEL_FILE_EXPORTER_PATH: process.env.COPILOT_OTEL_FILE_EXPORTER_PATH }
  let reset: (...args: never[]) => Promise<{ ok: boolean; cancelled?: boolean; backupName?: string; error?: string }>
  let scan: (...args: never[]) => Promise<{ ok: boolean; error?: string }>

  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'tokenstats-ipc-'))
    process.env.HOME = directory
    process.env.CLAUDE_CONFIG_DIR = join(directory, '.claude')
    process.env.COPILOT_HOME = join(directory, '.copilot')
    process.env.COPILOT_OTEL_FILE_EXPORTER_PATH = join(directory, 'copilot-otel.jsonl')
    mocks.app.getPath.mockReturnValue(directory)
    await import('../src/main/index')
    await new Promise<void>((resolve) => setImmediate(resolve))
    reset = mocks.handlers.get('tokenstats:resetDatabase') as typeof reset
    scan = mocks.handlers.get('tokenstats:scanAll') as typeof scan
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
})
