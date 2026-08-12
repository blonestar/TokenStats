import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const numericIdentifier = '(?:0|[1-9]\\d*)'
const semverIdentifier = `(?:${numericIdentifier}|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)`
const semverPattern = new RegExp(`^${numericIdentifier}\\.${numericIdentifier}\\.${numericIdentifier}(?:-${semverIdentifier}(?:\\.${semverIdentifier})*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`)
const packagePath = join(process.cwd(), 'package.json')

function fail(message) {
  console.error(`Release version check failed: ${message}`)
  process.exitCode = 1
}

let packageJson
try {
  packageJson = JSON.parse(readFileSync(packagePath, 'utf8'))
} catch (error) {
  fail(`could not read ${packagePath}: ${error instanceof Error ? error.message : String(error)}`)
}

const version = typeof packageJson?.version === 'string' ? packageJson.version : null
if (!version || !semverPattern.test(version)) {
  fail(`package.json contains an invalid SemVer version: ${JSON.stringify(version)}`)
}

const argumentsWithoutSeparator = process.argv.slice(2).filter((argument) => argument !== '--')
const stableOnly = argumentsWithoutSeparator.includes('--stable-only')
const providedRef = argumentsWithoutSeparator.find((argument) => !argument.startsWith('--')) ?? process.env.GITHUB_REF_NAME
const tag = typeof providedRef === 'string' ? providedRef.replace(/^refs\/tags\//, '') : ''
if (!tag) {
  fail('provide a release tag as the first argument or through GITHUB_REF_NAME')
}

const versionWithoutBuildMetadata = version.split('+', 1)[0]
if (stableOnly && versionWithoutBuildMetadata.includes('-')) {
  fail(`stable releases cannot use prerelease package.json version ${JSON.stringify(version)}`)
}

const expectedTag = `v${version}`
if (tag !== expectedTag) {
  fail(`tag ${JSON.stringify(tag)} does not match package.json version ${JSON.stringify(version)}; expected ${expectedTag}`)
}

if (!process.exitCode) {
  console.log(`Release version validated: ${tag} (package.json ${version})`)
}
