import { afterEach, describe, expect, it, vi } from 'vitest'
import { RefreshScheduler } from '../src/main/refresh-scheduler'

describe('refresh scheduler', () => {
  afterEach(() => vi.useRealTimers())

  it('runs enabled refreshes at the configured interval and stops cleanly', async () => {
    vi.useFakeTimers()
    const onRefresh = vi.fn()
    const scheduler = new RefreshScheduler(onRefresh)

    scheduler.start({ enabled: true, intervalMinutes: 1 })
    await vi.advanceTimersByTimeAsync(59_999)
    expect(onRefresh).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(onRefresh).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(onRefresh).toHaveBeenCalledTimes(2)

    scheduler.stop()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(onRefresh).toHaveBeenCalledTimes(2)
  })

  it('does not schedule disabled refreshes and replaces the interval when settings change', async () => {
    vi.useFakeTimers()
    const onRefresh = vi.fn()
    const scheduler = new RefreshScheduler(onRefresh)

    scheduler.start({ enabled: false, intervalMinutes: 1 })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(onRefresh).not.toHaveBeenCalled()

    scheduler.setSettings({ enabled: true, intervalMinutes: 5 })
    await vi.advanceTimersByTimeAsync(4 * 60_000 + 59_999)
    expect(onRefresh).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })
})
