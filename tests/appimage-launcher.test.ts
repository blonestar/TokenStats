import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { replaceAppImageExec, syncAppImageDesktopEntry } from '../src/main/appimage-launcher'

function withDesktopEntry(content: string, callback: (home: string, desktopPath: string) => void, xdgDataHome?: string): void {
  const home = mkdtempSync(join(tmpdir(), 'tokenstats-appimage-launcher-'))
  const dataHome = xdgDataHome ?? join(home, '.local', 'share')
  const applications = join(dataHome, 'applications')
  mkdirSync(applications, { recursive: true })
  const desktopPath = join(applications, 'local.tokenstats.app.desktop')
  writeFileSync(desktopPath, content)
  try {
    callback(home, desktopPath)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
}

describe('AppImage desktop launcher synchronization', () => {
  it('updates a versioned AppImage while preserving arguments and custom fields', () => {
    const content = '[Desktop Entry]\nName=TokenStats\nExec=/tmp/TokenStats-0.1.3-linux-x86_64.AppImage %U\nIcon=tokenstats\n'
    const updated = replaceAppImageExec(content, '/home/user/TokenStats-linux-x86_64.AppImage')

    expect(updated).toContain('Exec="/home/user/TokenStats-linux-x86_64.AppImage" %U')
    expect(updated).toContain('Icon=tokenstats')
  })

  it('updates main and action launchers while respecting XDG_DATA_HOME', () => {
    withDesktopEntry('[Desktop Entry]\nName=TokenStats\nExec="/tmp/TokenStats-0.1.3.AppImage" %U\n\n[Desktop Action Open]\nExec=/tmp/TokenStats-0.1.3.AppImage --open\n', (home, desktopPath) => {
      expect(syncAppImageDesktopEntry({ appImagePath: '/tmp/TokenStats-linux-x86_64.AppImage', home })).toBe(true)
      const updated = readFileSync(desktopPath, 'utf8')
      expect(updated).toContain('Exec="/tmp/TokenStats-linux-x86_64.AppImage" %U')
      expect(updated).toContain('Exec="/tmp/TokenStats-linux-x86_64.AppImage" --open')
    })

    const xdgRoot = mkdtempSync(join(tmpdir(), 'tokenstats-xdg-'))
    const xdgDataHome = join(xdgRoot, 'data')
    try {
      withDesktopEntry('[Desktop Entry]\nExec=/tmp/TokenStats-0.1.3.AppImage %U\n', (home, desktopPath) => {
        expect(syncAppImageDesktopEntry({ appImagePath: '/tmp/TokenStats-linux-x86_64.AppImage', home, xdgDataHome })).toBe(true)
        expect(readFileSync(desktopPath, 'utf8')).toContain('TokenStats-linux-x86_64.AppImage')
      }, xdgDataHome)
    } finally {
      rmSync(xdgRoot, { recursive: true, force: true })
    }
  })

  it('does not rewrite non-AppImage launchers or missing desktop entries', () => {
    expect(replaceAppImageExec('[Desktop Entry]\nExec=/opt/TokenStats/tokenstats %U\n', '/tmp/TokenStats-linux-x86_64.AppImage')).toBeUndefined()
    const home = mkdtempSync(join(tmpdir(), 'tokenstats-appimage-missing-'))
    try {
      expect(syncAppImageDesktopEntry({ appImagePath: '/tmp/TokenStats-linux-x86_64.AppImage', home })).toBe(false)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})
