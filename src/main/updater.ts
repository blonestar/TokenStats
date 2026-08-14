import { autoUpdater } from 'electron-updater'
import { accessSync, constants, statSync } from 'node:fs'
import { extname, isAbsolute } from 'node:path'
import { DEFAULT_UPDATE_SETTINGS, type UpdateSettings, type UpdateState, type UpdateStatus } from '../shared/contracts'

export const initialUpdateState: UpdateState = {
  status: 'idle',
  version: null,
  progress: null,
  message: null,
  canInstall: false,
  settings: DEFAULT_UPDATE_SETTINGS,
  lastCheckedAt: null,
  nextCheckAt: null
}

export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

type UpdateListener = (...args: unknown[]) => void

export type UpdateDriver = {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  on(event: string, listener: UpdateListener): UpdateDriver
  checkForUpdates(): Promise<unknown>
  downloadUpdate(): Promise<unknown>
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void
}

export function isLinuxAppImageUpdateSupported(input: { platform: NodeJS.Platform; isPackaged: boolean; appImagePath?: string }): boolean {
  if (input.platform !== 'linux' || !input.isPackaged || !input.appImagePath || !isAbsolute(input.appImagePath) || extname(input.appImagePath).toLowerCase() !== '.appimage') return false
  try {
    accessSync(input.appImagePath, constants.X_OK)
    return statSync(input.appImagePath).isFile()
  } catch {
    return false
  }
}

function versionFrom(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const version = (value as { version?: unknown }).version
  return typeof version === 'string' && version.length > 0 ? version : null
}

function progressFrom(value: unknown): number {
  if (!value || typeof value !== 'object') return 0
  const percent = Number((value as { percent?: unknown }).percent)
  return Number.isFinite(percent) ? Math.max(0, Math.min(100, Math.round(percent))) : 0
}

export class UpdateController {
  private state: UpdateState
  private timer: ReturnType<typeof setInterval> | undefined
  private checkPromise: Promise<UpdateState> | undefined
  private started = false
  private settings: UpdateSettings
  private lastCheckedAt: string | null = null
  private nextCheckAt: string | null = null

  constructor(
    private readonly options: {
      driver: UpdateDriver
      enabled: boolean
      onStateChange: (state: UpdateState) => void
      settings?: UpdateSettings
      intervalMs?: number
      canInstall?: () => boolean
    }
  ) {
    this.settings = { ...(options.settings ?? DEFAULT_UPDATE_SETTINGS) }
    this.state = options.enabled ? this.stateWithMetadata({ ...initialUpdateState }) : this.stateWithMetadata({ ...initialUpdateState, status: 'unsupported', message: 'Automatic updates require a packaged Linux AppImage.' })
    options.driver.autoDownload = false
    options.driver.autoInstallOnAppQuit = false
    options.driver.on('checking-for-update', () => {
      if (this.state.status !== 'downloaded' && this.state.status !== 'downloading') this.transition('checking')
    })
    options.driver.on('update-available', (info) => {
      this.transition('available', versionFrom(info))
    })
    options.driver.on('update-not-available', () => {
      this.transition('idle')
    })
    options.driver.on('download-progress', (progress) => {
      if (this.state.status === 'downloading') this.transition('downloading', this.state.version, progressFrom(progress))
    })
    options.driver.on('update-downloaded', (info) => {
      this.transition('downloaded', versionFrom(info) ?? this.state.version, 100)
    })
    options.driver.on('error', () => {
      if (this.state.status !== 'idle' && this.state.status !== 'unsupported') this.transition('error', this.state.version, null, this.errorMessage(this.state.status))
    })
  }

  getState(): UpdateState { return { ...this.state, settings: { ...this.state.settings } } }

  setSettings(settings: UpdateSettings): void {
    const wasEnabled = this.settings.enabled
    this.settings = { ...settings }
    this.clearTimer()
    if (this.started && this.options.enabled && settings.enabled) this.scheduleTimer()
    else this.nextCheckAt = null
    this.emitState()
    if (this.started && this.options.enabled && settings.enabled && !wasEnabled) void this.checkForUpdates()
  }

  async checkForUpdates(): Promise<UpdateState> {
    if (!this.options.enabled || this.state.status === 'unsupported' || this.state.status === 'downloading' || this.state.status === 'downloaded') return this.getState()
    if (this.checkPromise) return this.checkPromise

    this.lastCheckedAt = new Date().toISOString()
    this.transition('checking')
    this.checkPromise = this.options.driver.checkForUpdates()
      .then(() => {
        if (this.state.status === 'checking') this.transition('idle')
        return this.getState()
      })
      .catch(() => {
        if (this.state.status === 'checking') this.transition('error', null, null, 'Update check unavailable. Try again.')
        return this.getState()
      })
      .finally(() => { this.checkPromise = undefined })
    return this.checkPromise
  }

  async downloadUpdate(): Promise<UpdateState> {
    if (!this.options.enabled || this.state.status !== 'available') return this.getState()
    const version = this.state.version
    this.transition('downloading', version, 0)
    try {
      await this.options.driver.downloadUpdate()
    } catch {
      if (this.getState().status !== 'downloaded') this.transition('error', version, null, 'Update download failed. Try again.')
    }
    return this.getState()
  }

  installUpdate(): UpdateState {
    if (!this.options.enabled || this.state.status !== 'downloaded') return this.getState()
    if (!this.state.canInstall || (this.options.canInstall && !this.options.canInstall())) {
      this.syncInstallability()
      return this.getState()
    }
    const version = this.state.version
    this.transition('installing', version, 100, 'Installing the update and restarting TokenStats.')
    try {
      this.options.driver.quitAndInstall(false, true)
    } catch {
      this.transition('error', version, null, 'Update installation failed. Try again.')
    }
    return this.getState()
  }

  syncInstallability(): void {
    if (this.state.status !== 'downloaded') return
    const canInstall = this.options.canInstall ? this.options.canInstall() : true
    this.transition('downloaded', this.state.version, this.state.progress, canInstall ? null : 'Finish the current local operation before installing the update.', canInstall)
  }

  start(): void {
    if (this.started || !this.options.enabled) return
    this.started = true
    if (this.settings.enabled) {
      this.scheduleTimer()
      if (this.settings.checkOnStartup) void this.checkForUpdates()
    } else {
      this.nextCheckAt = null
      this.emitState()
    }
  }

  stop(): void {
    this.clearTimer()
    this.nextCheckAt = null
    this.started = false
    this.emitState()
  }

  private transition(status: UpdateStatus, version: string | null = null, progress: number | null = null, message: string | null = null, canInstall = status === 'downloaded' && (this.options.canInstall ? this.options.canInstall() : true)): void {
    this.state = this.stateWithMetadata({ status, version, progress, message, canInstall })
    this.emitState()
  }

  private stateWithMetadata(state: Omit<UpdateState, 'settings' | 'lastCheckedAt' | 'nextCheckAt'>): UpdateState {
    return { ...state, settings: { ...this.settings }, lastCheckedAt: this.lastCheckedAt, nextCheckAt: this.nextCheckAt }
  }

  private emitState(): void {
    this.state = this.stateWithMetadata(this.state)
    this.options.onStateChange(this.getState())
  }

  private intervalMs(): number {
    return this.options.intervalMs ?? this.settings.intervalHours * 60 * 60 * 1000
  }

  private scheduleTimer(): void {
    if (!this.started || !this.options.enabled || !this.settings.enabled) return
    const intervalMs = this.intervalMs()
    this.nextCheckAt = new Date(Date.now() + intervalMs).toISOString()
    this.timer = setInterval(() => {
      this.nextCheckAt = new Date(Date.now() + intervalMs).toISOString()
      this.emitState()
      void this.checkForUpdates()
    }, intervalMs)
    this.timer.unref?.()
  }

  private clearTimer(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
  }

  private errorMessage(status: UpdateStatus): string {
    if (status === 'checking') return 'Update check unavailable. Try again.'
    if (status === 'downloading') return 'Update download failed. Try again.'
    if (status === 'installing') return 'Update installation failed. Try again.'
    return 'Update action failed. Try again.'
  }
}

export function createUpdateController(options: { enabled: boolean; onStateChange: (state: UpdateState) => void; settings?: UpdateSettings; intervalMs?: number; canInstall?: () => boolean }): UpdateController {
  return new UpdateController({ ...options, driver: autoUpdater as unknown as UpdateDriver })
}
