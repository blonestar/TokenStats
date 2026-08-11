import { isAbsolute } from 'node:path'

export function sourceRoot(override: string | undefined, fallback: string): string {
  return override && isAbsolute(override) ? override : fallback
}
