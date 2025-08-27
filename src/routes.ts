import type { Hono } from 'hono'
import type { Context } from 'hono'
import { getAppsList, readAppIndex, pickLatestRelease, findReleaseByVersion, getAppDir } from './storage'
import { join } from 'node:path'
import semver from 'semver'
import { env } from './config'

export function registerRoutes(app: Hono) {
  // List apps
  app.get('/v1/apps', async (c: Context) => {
    const apps = await getAppsList()
    return c.json({ apps })
  })

  // Get all releases for an app
  app.get('/v1/apps/:app/releases', async (c: Context) => {
    const appName = c.req.param('app')
    const channel = c.req.query('channel')
    const index = await readAppIndex(appName)
    if (!index) return c.json({ error: 'not_found' }, 404)

    if (!channel) return c.json(index)

    const filtered = {
      ...index,
      releases: index.releases.filter((r) => r.channel === channel),
    }
    return c.json(filtered)
  })

  // Latest release for app (by channel/platform)
  app.get('/v1/apps/:app/releases/latest', async (c: Context) => {
    const appName = c.req.param('app')
    const channel = c.req.query('channel') || undefined
    const platform = c.req.query('platform') || undefined
    const index = await readAppIndex(appName)
    if (!index) return c.json({ error: 'not_found' }, 404)

    const latest = pickLatestRelease(index, { channel, platform })
    if (!latest) return c.json({ error: 'no_release' }, 404)
    return c.json(latest)
  })

  // Specific version metadata
  app.get('/v1/apps/:app/releases/:version', async (c: Context) => {
    const appName = c.req.param('app')
    const version = c.req.param('version')
    const index = await readAppIndex(appName)
    if (!index) return c.json({ error: 'not_found' }, 404)

    const rel = findReleaseByVersion(index, version)
    if (!rel) return c.json({ error: 'not_found' }, 404)
    return c.json(rel)
  })

  // Download endpoint with Range support
  app.get('/v1/apps/:app/releases/:version/download', async (c: Context) => {
    const appName = c.req.param('app')
    const version = c.req.param('version')
    const platform = c.req.query('platform')
    if (!platform) return c.json({ error: 'platform_required' }, 400)

    const index = await readAppIndex(appName)
    if (!index) return c.json({ error: 'not_found' }, 404)
    const rel = findReleaseByVersion(index, version)
    if (!rel) return c.json({ error: 'not_found' }, 404)
    const asset = rel.assets.find((a) => a.platform === platform)
    if (!asset) return c.json({ error: 'asset_not_found' }, 404)

    const filePath = join(getAppDir(appName), version, asset.filename)
    try {
      const f = Bun.file(filePath)
      const size = f.size
      const range = c.req.header('range') || c.req.header('Range')
      c.header('Accept-Ranges', 'bytes')
      c.header('Content-Disposition', `attachment; filename="${asset.filename}"`)

      if (range) {
        // Example: bytes=0-1023 | bytes=100- | bytes=-500
        const m = /^bytes=(\d*)-(\d*)$/.exec(range)
        if (!m) {
          return c.text('Bad Range', 416)
        }
        const hasStart = m[1] !== ''
        const hasEnd = m[2] !== ''
        let start: number
        let end: number

        if (hasStart && hasEnd) {
          start = parseInt(m[1], 10)
          end = parseInt(m[2], 10)
        } else if (hasStart && !hasEnd) {
          start = parseInt(m[1], 10)
          end = size - 1
        } else if (!hasStart && hasEnd) {
          const suffixLength = parseInt(m[2], 10)
          if (suffixLength <= 0) {
            c.header('Content-Range', `bytes */${size}`)
            return c.text('Requested Range Not Satisfiable', 416)
          }
          start = Math.max(size - suffixLength, 0)
          end = size - 1
        } else {
          // both empty, invalid
          return c.text('Bad Range', 416)
        }

        if (start < 0 || start >= size) {
          c.header('Content-Range', `bytes */${size}`)
          return c.text('Requested Range Not Satisfiable', 416)
        }
        if (end < start) end = start
        if (end >= size) end = size - 1

        const chunk = f.slice(start, end + 1)
        const res = new Response(chunk, {
          status: 206,
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(end - start + 1),
            'Content-Range': `bytes ${start}-${end}/${size}`,
          },
        })
        return res as unknown as Response
      }

      // Full content
      return new Response(f, {
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(size),
        },
      }) as unknown as Response
    } catch (e) {
      return c.json({ error: 'file_not_found' }, 404)
    }
  })

  // Tauri v2 Updater-compatible dynamic endpoint
  // Returns 204 if no update is available, otherwise 200 with required JSON
  app.get('/v1/tauri/:app/update', async (c: Context) => {
    const appName = c.req.param('app')
    const urlObj = new URL(c.req.url)
    const current = urlObj.searchParams.get('current_version') || urlObj.searchParams.get('currentVersion') || '0.0.0'
    const channel = urlObj.searchParams.get('channel') || undefined
    const target = urlObj.searchParams.get('target') || undefined
    const arch = urlObj.searchParams.get('arch') || undefined
    const platformOverride = urlObj.searchParams.get('platform') || undefined

    const index = await readAppIndex(appName)
    if (!index) return c.json({ error: 'not_found' }, 404)

    // Map tauri target/arch to our platform names
    const mapTargetToPlatform = (t?: string, a?: string): string | undefined => {
      if (platformOverride) return platformOverride
      if (!t) return undefined
      const archNorm = (a || (t.includes('aarch64') ? 'aarch64' : t.includes('arm64') ? 'aarch64' : 'x86_64'))
        .replace('amd64', 'x86_64')
        .replace('arm64', 'aarch64')
      if (t.startsWith('darwin') || t.startsWith('macos')) return `macos-${archNorm}`
      if (t.startsWith('windows') || t.startsWith('win')) return `windows-${archNorm}`
      if (t.startsWith('linux')) return `linux-${archNorm}`
      return undefined
    }

    const platform = mapTargetToPlatform(target, arch)

    // Find latest release newer than current version matching channel/platform
    const rel = pickLatestRelease(index, { channel, platform })
    if (!rel) {
      return new Response(null, { status: 204 }) as unknown as Response
    }
    const relV = semver.coerce(rel.version)?.version ?? rel.version
    const curV = semver.coerce(current)?.version ?? current
    if (!semver.valid(relV) || !semver.valid(curV) || !semver.gt(relV, curV)) {
      return new Response(null, { status: 204 }) as unknown as Response
    }

    const asset = platform ? rel.assets.find((a) => a.platform === platform) : rel.assets[0]
    if (!asset) return new Response(null, { status: 204 }) as unknown as Response

    // Build absolute download URL
    const reqOrigin = new URL(c.req.url).origin
    const base = env.LH_BASE_URL || reqOrigin
    const downloadUrl = asset.url || `${base}/v1/apps/${appName}/releases/${rel.version}/download?platform=${encodeURIComponent(asset.platform)}`

    // signature is required by Tauri updater; if missing, return 204 to avoid client error
    if (!asset.signature) {
      return new Response(null, { status: 204 }) as unknown as Response
    }

    const resp = {
      version: rel.version,
      pub_date: rel.pub_date,
      url: downloadUrl,
      signature: asset.signature,
      notes: rel.notes || '',
    }
    return c.json(resp)
  })
}
