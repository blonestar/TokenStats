import { describe, expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const repositoryRoot = join(__dirname, '..')
const script = join(repositoryRoot, 'scripts', 'validate-release-version.mjs')
const packageVersion = JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8')).version as string

function run(tag?: string, env: NodeJS.ProcessEnv = {}, args: string[] = [], cwd = repositoryRoot) {
  return spawnSync(process.execPath, [script, ...args, ...(tag ? [tag] : [])], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env }
  })
}

function runWithPackageVersion(version: string, args: string[]) {
  const directory = mkdtempSync(join(tmpdir(), 'tokenstats-release-version-'))
  try {
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ version }))
    return run(`v${version}`, {}, args, directory)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

describe('release version validation', () => {
  it('accepts the exact v-prefixed tag for package.json', () => {
    const output = execFileSync(process.execPath, [script, `v${packageVersion}`], { cwd: repositoryRoot, encoding: 'utf8' })
    expect(output).toContain(`Release version validated: v${packageVersion}`)
  })

  it('also accepts a GitHub refs/tags value', () => {
    const result = run(`refs/tags/v${packageVersion}`)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain(`Release version validated: v${packageVersion}`)
  })

  it('rejects a tag whose version differs from package.json', () => {
    const result = run('v9.9.9')
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('does not match package.json version')
  })

  it('rejects a missing tag instead of guessing a release version', () => {
    const result = run(undefined, { GITHUB_REF_NAME: '' })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('provide a release tag')
  })

  it('rejects prerelease packages for the Stable workflow', () => {
    const result = runWithPackageVersion('0.1.0-nightly.1', ['--stable-only', '--'])
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('stable releases cannot use prerelease')
  })

  it('accepts stable SemVer build metadata', () => {
    const result = runWithPackageVersion('0.1.0+build.1', ['--stable-only'])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Release version validated: v0.1.0+build.1')
  })

  it('rejects leading-zero numeric SemVer prerelease identifiers', () => {
    const result = runWithPackageVersion('0.1.0-rc.01', [])
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('invalid SemVer version')
  })
})
