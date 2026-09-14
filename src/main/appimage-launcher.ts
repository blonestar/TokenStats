import { readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

export const TOKENSTATS_DESKTOP_FILE = 'local.tokenstats.app.desktop'

type ExecCommand = { executable: string; suffix: string }

function applicationsDirectory(home: string, xdgDataHome?: string): string {
  const dataHome = xdgDataHome && isAbsolute(xdgDataHome) ? xdgDataHome : join(home, '.local', 'share')
  return join(dataHome, 'applications')
}

function parseExecCommand(line: string): ExecCommand | undefined {
  if (!line.startsWith('Exec=')) return undefined
  const command = line.slice('Exec='.length)
  if (command.startsWith('"')) {
    for (let index = 1; index < command.length; index += 1) {
      if (command[index] === '"' && command[index - 1] !== '\\') return { executable: command.slice(1, index), suffix: command.slice(index + 1) }
    }
    return undefined
  }
  const match = /^(\S+)(.*)$/.exec(command)
  return match ? { executable: match[1], suffix: match[2] } : undefined
}

function quoteExecPath(path: string): string {
  return `"${path.replace(/([\\"])/g, '\\$1')}"`
}

function isAppImagePath(path: string): boolean {
  return isAbsolute(path) && path.toLowerCase().endsWith('.appimage')
}

/**
 * Replaces AppImage executables in a desktop entry and preserves their
 * arguments, actions, and all unrelated user customizations.
 */
export function replaceAppImageExec(content: string, appImagePath: string): string | undefined {
  if (!isAppImagePath(appImagePath)) return undefined

  const lines = content.split('\n')
  let changed = false
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const lineWithoutCarriageReturn = line.endsWith('\r') ? line.slice(0, -1) : line
    const command = parseExecCommand(lineWithoutCarriageReturn)
    if (!command || !isAppImagePath(command.executable)) continue
    const carriageReturn = line.endsWith('\r') ? '\r' : ''
    lines[index] = `Exec=${quoteExecPath(appImagePath)}${command.suffix}${carriageReturn}`
    changed = true
  }
  return changed ? lines.join('\n') : undefined
}

export function syncAppImageDesktopEntry(options: { appImagePath: string; home: string; xdgDataHome?: string; desktopFileName?: string }): boolean {
  if (!isAbsolute(options.home) || !isAppImagePath(options.appImagePath)) return false
  const desktopPath = join(applicationsDirectory(options.home, options.xdgDataHome), options.desktopFileName ?? TOKENSTATS_DESKTOP_FILE)
  try {
    const current = readFileSync(desktopPath, 'utf8')
    const updated = replaceAppImageExec(current, options.appImagePath)
    if (updated === undefined) return false
    writeFileSync(desktopPath, updated, 'utf8')
    return true
  } catch {
    return false
  }
}
