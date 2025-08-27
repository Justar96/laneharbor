import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { env } from './config'
import type { AppIndex, ReleaseEntry } from './types'
import semver from 'semver'

export function getDataDir() {
  // Default to local ./storage for dev if LH_DATA_DIR is not set
  return env.LH_DATA_DIR ?? join(process.cwd(), 'storage')
}

export async function getAppsList(): Promise<string[]> {
  const appsDir = join(getDataDir(), 'apps')
  try {
    const items = await readdir(appsDir, { withFileTypes: true })
    return items.filter((d) => d.isDirectory()).map((d) => d.name)
  } catch {
    return []
  }
}

export function getAppDir(app: string) {
  return join(getDataDir(), 'apps', app)
}

export function getAppIndexPath(app: string) {
  return join(getAppDir(app), 'index.json')
}

export async function readAppIndex(app: string): Promise<AppIndex | null> {
  const p = getAppIndexPath(app)
  try {
    const raw = await readFile(p, 'utf8')
    const parsed = JSON.parse(raw) as AppIndex
    // Minimal validation
    if (!parsed || parsed.app !== app || !Array.isArray(parsed.releases)) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function findReleaseByVersion(index: AppIndex, version: string): ReleaseEntry | undefined {
  return index.releases.find((r) => r.version === version)
}

export function pickLatestRelease(
  index: AppIndex,
  opts: { channel?: string; platform?: string }
): ReleaseEntry | undefined {
  const channel = opts.channel ?? env.LH_DEFAULT_CHANNEL ?? 'stable'
  const platform = opts.platform

  const rels = index.releases
    .filter((r) => (channel ? r.channel === channel : true))
    .filter((r) => (platform ? r.assets.some((a) => a.platform === platform) : true))
    .sort((a, b) => semver.rcompare(a.version, b.version))

  return rels[0]
}

export async function writeAppIndex(app: string, index: AppIndex): Promise<void> {
  const p = getAppIndexPath(app)
  const data = JSON.stringify(index, null, 2)
  await writeFile(p, data, 'utf8')
}
