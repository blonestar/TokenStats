import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const repositoryRoot = join(__dirname, '..')
const packageJson = JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
  build: {
    files: string[]
    win: {
      target: Array<{ target: string; arch: string[] }>
      icon: string
      files: string[]
    }
  }
}

describe('Windows release packaging', () => {
  it('declares the Windows x64 NSIS package and release commands', () => {
    expect(packageJson.scripts['package:win']).toContain('electron-builder --win nsis --x64 --publish never')
    expect(packageJson.scripts['package:win:release']).toContain('electron-builder --win nsis --x64 --publish always')
    expect(packageJson.build.win.target).toEqual([{ target: 'nsis', arch: ['x64'] }])
    expect(packageJson.build.win.icon).toBe('assets/icons/TokenStats.ico')
    expect(packageJson.build.win.files).toContain('!node_modules/better-sqlite3/prebuilds/{darwin-arm64,darwin-x64,linux-arm64,linux-x64,linuxmusl-arm64,linuxmusl-x64,win32-arm64}.node')
  })

  it('keeps the Windows icon and runner smoke script in the repository', () => {
    expect(packageJson.build.files).toContain('assets/icons/TokenStats.ico')
    const iconPath = join(repositoryRoot, packageJson.build.win.icon)
    expect(existsSync(iconPath)).toBe(true)
    expect(readFileSync(iconPath).subarray(0, 4)).toEqual(Buffer.from([0, 0, 1, 0]))
    expect(existsSync(join(repositoryRoot, 'scripts', 'validate-windows-package.ps1'))).toBe(true)
  })
})
