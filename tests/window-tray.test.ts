import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

type Listener = (...args: any[]) => void

const mocks = vi.hoisted(() => {
  let beforeQuit: (() => void) | undefined

  const app = {
    whenReady: vi.fn(() => Promise.resolve()),
    getAppPath: vi.fn(() => process.cwd()),
    getPath: vi.fn(() => process.cwd()),
    getVersion: vi.fn(() => 'test-version'),
    on: vi.fn((event: string, callback: Listener) => {
      if (event === 'before-quit') beforeQuit = callback
    }),
    quit: vi.fn(() => {
      const callback = beforeQuit
      beforeQuit = undefined
      callback?.()
    })
  }

  class FakeBrowserWindow {
    static instances: FakeBrowserWindow[] = []
    private readonly listeners = new Map<string, Listener>()
    private visible = true
    private minimized = false
    webContents = {
      setWindowOpenHandler: vi.fn(),
      on: vi.fn(),
      getZoomFactor: vi.fn(() => 1),
      setZoomFactor: vi.fn(),
      loadURL: vi.fn(),
      loadFile: vi.fn()
    }
    setMenuBarVisibility = vi.fn()
    loadURL = vi.fn()
    loadFile = vi.fn()

    constructor() {
      FakeBrowserWindow.instances.push(this)
    }

    on(event: string, callback: Listener): this {
      this.listeners.set(event, callback)
      return this
    }

    isVisible(): boolean { return this.visible }
    isMinimized(): boolean { return this.minimized }
    show(): void { this.visible = true; this.emit('show') }
    hide(): void { this.visible = false; this.emit('hide') }
    focus(): void {}
    restore(): void { this.minimized = false; this.emit('restore') }

    close(): void {
      let prevented = false
      this.emit('close', { preventDefault: () => { prevented = true } })
      if (!prevented) this.emit('closed')
    }

    private emit(event: string, ...args: unknown[]): void {
      this.listeners.get(event)?.(...args)
    }
  }

  class FakeTray {
    static instances: FakeTray[] = []
    private readonly listeners = new Map<string, Listener>()
    contextMenu: { template: Array<Record<string, unknown>> } | undefined
    destroyed = false

    constructor(public readonly image: unknown) {
      FakeTray.instances.push(this)
    }

    setToolTip = vi.fn()
    setContextMenu = vi.fn((menu: { template: Array<Record<string, unknown>> }) => { this.contextMenu = menu })
    on(event: string, callback: Listener): this {
      this.listeners.set(event, callback)
      return this
    }
    destroy(): void { this.destroyed = true }
  }

  const Menu = {
    buildFromTemplate: vi.fn((template: Array<Record<string, unknown>>) => ({ template }))
  }
  const nativeImage = { createFromPath: vi.fn((path: string) => ({ path })) }
  const dialog = { showMessageBox: vi.fn() }
  const ipcMain = { handle: vi.fn() }

  return { app, beforeQuit: () => beforeQuit?.(), BrowserWindow: FakeBrowserWindow, Tray: FakeTray, Menu, nativeImage, dialog, ipcMain }
})

vi.mock('electron', () => ({
  app: mocks.app,
  BrowserWindow: mocks.BrowserWindow,
  Tray: mocks.Tray,
  Menu: mocks.Menu,
  nativeImage: mocks.nativeImage,
  dialog: mocks.dialog,
  ipcMain: mocks.ipcMain
}))

describe('window and tray lifecycle', () => {
  let directory: string
  let window: InstanceType<typeof mocks.BrowserWindow>
  let tray: InstanceType<typeof mocks.Tray>

  const menuLabels = (): string[] => tray.contextMenu?.template
    .filter((item) => typeof item.label === 'string')
    .map((item) => item.label as string) ?? []

  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'tokenstats-window-tray-'))
    mocks.app.getPath.mockReturnValue(directory)
    const { TokenDatabase } = await import('../src/main/database')
    vi.spyOn(TokenDatabase.prototype, 'close')
    await import('../src/main/index')
    await new Promise<void>((resolve) => setImmediate(resolve))
    window = mocks.BrowserWindow.instances[0]
    tray = mocks.Tray.instances[0]
  })

  afterAll(() => {
    rmSync(directory, { recursive: true, force: true })
  })

  it('hides the window on close and updates the tray action', () => {
    expect(menuLabels()).toEqual(['Hide window', 'Exit TokenStats'])

    window.close()

    expect(window.isVisible()).toBe(false)
    expect(mocks.app.quit).not.toHaveBeenCalled()
    expect(menuLabels()).toEqual(['Show window', 'Exit TokenStats'])
  })

  it('shows the window through the tray action', () => {
    const showItem = tray.contextMenu?.template[0]
    expect(showItem?.label).toBe('Show window')

    ;(showItem?.click as (() => void))()

    expect(window.isVisible()).toBe(true)
    expect(menuLabels()).toEqual(['Hide window', 'Exit TokenStats'])
  })

  it('exits only through the explicit tray Exit action', async () => {
    const exitItem = tray.contextMenu?.template[2]
    expect(exitItem?.label).toBe('Exit TokenStats')

    ;(exitItem?.click as (() => void))()

    expect(mocks.app.quit).toHaveBeenCalledTimes(1)
    expect(tray.destroyed).toBe(true)
    const { TokenDatabase } = await import('../src/main/database')
    expect(TokenDatabase.prototype.close).toHaveBeenCalledTimes(1)
  })
})
