import type { RefreshSettings } from '../shared/contracts'

export class RefreshScheduler {
  private timer: ReturnType<typeof setTimeout> | undefined
  private generation = 0

  constructor(private readonly onRefresh: () => void) {}

  start(settings: RefreshSettings): void {
    this.stop()
    if (!settings.enabled) return

    const generation = ++this.generation
    const intervalMs = settings.intervalMinutes * 60 * 1000
    this.schedule(intervalMs, generation)
  }

  setSettings(settings: RefreshSettings): void {
    this.start(settings)
  }

  stop(): void {
    this.generation += 1
    if (!this.timer) return
    clearTimeout(this.timer)
    this.timer = undefined
  }

  private schedule(intervalMs: number, generation: number): void {
    if (generation !== this.generation) return
    this.timer = setTimeout(() => {
      this.timer = undefined
      try {
        this.onRefresh()
      } catch {
        // The refresh owner reports the failed operation; keep the scheduler alive.
      } finally {
        if (generation === this.generation) this.schedule(intervalMs, generation)
      }
    }, intervalMs)
    this.timer.unref?.()
  }
}
