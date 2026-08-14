import { describe, expect, it, vi } from 'vitest'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { UpdateController, isLinuxAppImageUpdateSupported, type UpdateDriver } from '../src/main/updater'

vi.mock('electron-updater', () => ({ autoUpdater: {} }))

type Listener = (...args: unknown[]) => void

function fakeDriver(): { driver: UpdateDriver; emit: (event: string, ...args: unknown[]) => void } {
  const listeners = new Map<string, Listener>()
  const driver = {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    on: vi.fn((event: string, listener: Listener) => {
      listeners.set(event, listener)
      return driver
    }),
    checkForUpdates: vi.fn(async () => undefined),
    downloadUpdate: vi.fn(async () => undefined),
    quitAndInstall: vi.fn()
  }
  return { driver, emit: (event, ...args) => listeners.get(event)?.(...args) }
}

describe('update controller', () => {
  it('does not download automatically and requires a second install click', async () => {
    const { driver, emit } = fakeDriver()
    const states: string[] = []
    const controller = new UpdateController({ driver, enabled: true, onStateChange: (state) => { states.push(state.status) } })

    expect(driver.autoDownload).toBe(false)
    expect(driver.autoInstallOnAppQuit).toBe(false)

    driver.checkForUpdates.mockImplementationOnce(async () => {
      emit('checking-for-update')
      emit('update-available', { version: '0.1.1' })
    })
    await controller.checkForUpdates()
    expect(controller.getState()).toMatchObject({ status: 'available', version: '0.1.1' })
    expect(driver.downloadUpdate).not.toHaveBeenCalled()

    driver.downloadUpdate.mockImplementationOnce(async () => {
      emit('download-progress', { percent: 37.4 })
      emit('update-downloaded', { version: '0.1.1' })
    })
    await controller.downloadUpdate()
    expect(controller.getState()).toMatchObject({ status: 'downloaded', version: '0.1.1', progress: 100 })
    expect(states).toEqual(['checking', 'checking', 'available', 'downloading', 'downloading', 'downloaded'])

    controller.installUpdate()
    expect(driver.quitAndInstall).toHaveBeenCalledWith(false, true)
  })

  it('surfaces a safe error state when checking fails', async () => {
    const { driver } = fakeDriver()
    driver.checkForUpdates.mockRejectedValueOnce(new Error('network details must not reach the UI'))
    const controller = new UpdateController({ driver, enabled: true, onStateChange: () => undefined })

    await controller.checkForUpdates()

    expect(controller.getState()).toMatchObject({ status: 'error', message: 'Update check unavailable. Try again.' })
  })

  it('blocks install during an active local operation and surfaces install failures', async () => {
    const { driver, emit } = fakeDriver()
    let canInstall = false
    const controller = new UpdateController({ driver, enabled: true, canInstall: () => canInstall, onStateChange: () => undefined })

    driver.checkForUpdates.mockImplementationOnce(async () => { emit('update-available', { version: '0.1.1' }) })
    driver.downloadUpdate.mockImplementationOnce(async () => { emit('update-downloaded', { version: '0.1.1' }) })
    await controller.checkForUpdates()
    await controller.downloadUpdate()
    expect(controller.getState()).toMatchObject({ status: 'downloaded', canInstall: false })

    controller.installUpdate()
    expect(driver.quitAndInstall).not.toHaveBeenCalled()
    expect(controller.getState()).toMatchObject({ status: 'downloaded', message: 'Finish the current local operation before installing the update.' })

    canInstall = true
    controller.syncInstallability()
    driver.quitAndInstall.mockImplementationOnce(() => { emit('error') })
    controller.installUpdate()
    expect(controller.getState()).toMatchObject({ status: 'error', message: 'Update installation failed. Try again.' })
  })

  it('surfaces a synchronous quitAndInstall failure', () => {
    const { driver, emit } = fakeDriver()
    const controller = new UpdateController({ driver, enabled: true, onStateChange: () => undefined })
    emit('update-downloaded', { version: '0.1.1' })
    driver.quitAndInstall.mockImplementationOnce(() => { throw new Error('installer unavailable') })

    controller.installUpdate()

    expect(controller.getState()).toMatchObject({ status: 'error', message: 'Update installation failed. Try again.' })
  })

  it('only enables the updater for packaged Linux AppImages', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tokenstats-updater-'))
    const appImagePath = join(directory, 'TokenStats.AppImage')
    writeFileSync(appImagePath, 'test appimage')
    chmodSync(appImagePath, 0o755)
    try {
      expect(isLinuxAppImageUpdateSupported({ platform: 'linux', isPackaged: true, appImagePath })).toBe(true)
      expect(isLinuxAppImageUpdateSupported({ platform: 'linux', isPackaged: true, appImagePath: join(directory, 'tokenstats') })).toBe(false)
      expect(isLinuxAppImageUpdateSupported({ platform: 'linux', isPackaged: true })).toBe(false)
      expect(isLinuxAppImageUpdateSupported({ platform: 'darwin', isPackaged: true, appImagePath })).toBe(false)
      expect(isLinuxAppImageUpdateSupported({ platform: 'linux', isPackaged: false, appImagePath })).toBe(false)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('checks at startup, repeats on the interval, and stops cleanly', async () => {
    vi.useFakeTimers()
    try {
      const { driver } = fakeDriver()
      const controller = new UpdateController({ driver, enabled: true, intervalMs: 1000, onStateChange: () => undefined })

      controller.start()
      await vi.advanceTimersByTimeAsync(0)
      expect(driver.checkForUpdates).toHaveBeenCalledTimes(1)
      expect(controller.getState()).toMatchObject({ settings: { enabled: true, checkOnStartup: true, intervalHours: 6 }, lastCheckedAt: expect.any(String), nextCheckAt: expect.any(String) })
      await vi.advanceTimersByTimeAsync(1000)
      expect(driver.checkForUpdates).toHaveBeenCalledTimes(2)

      controller.stop()
      await vi.advanceTimersByTimeAsync(3000)
      expect(driver.checkForUpdates).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('honors disabled startup checks and can reconfigure the schedule', async () => {
    vi.useFakeTimers()
    try {
      const { driver } = fakeDriver()
      const controller = new UpdateController({ driver, enabled: true, settings: { enabled: false, checkOnStartup: true, intervalHours: 1 }, intervalMs: 1000, onStateChange: () => undefined })

      controller.start()
      await vi.advanceTimersByTimeAsync(3000)
      expect(driver.checkForUpdates).not.toHaveBeenCalled()
      expect(controller.getState()).toMatchObject({ settings: { enabled: false }, nextCheckAt: null })

      controller.setSettings({ enabled: true, checkOnStartup: false, intervalHours: 12 })
      await vi.advanceTimersByTimeAsync(0)
      expect(driver.checkForUpdates).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1000)
      expect(driver.checkForUpdates).toHaveBeenCalledTimes(2)
      expect(controller.getState()).toMatchObject({ settings: { enabled: true, checkOnStartup: false, intervalHours: 12 }, lastCheckedAt: expect.any(String), nextCheckAt: expect.any(String) })
    } finally {
      vi.useRealTimers()
    }
  })
})
