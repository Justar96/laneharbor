import type { Express, Request, Response, NextFunction } from 'express'
import type { StorageClient } from './clients/storage.client.js'
import { 
  getAppsList, 
  readAppIndex, 
  pickLatestRelease, 
  findReleaseByVersion, 
  getAppDir, 
  logDownloadMetric, 
  getAppInsights, 
  getGlobalAnalytics, 
  shouldUserGetRelease, 
  createUploadSession, 
  updateUploadSession, 
  getUploadSession, 
  analyzePackage, 
  savePackageAnalysis, 
  getPackageAnalysis 
} from './storage.js'
import type { DownloadMetric, UploadSession, PackageAnalysisResult } from './types.js'
import { join } from 'node:path'
import * as semver from 'semver'
import { env } from './config.js'

// Express request/response adapter helper
class ExpressContext {
  constructor(private req: Request, private res: Response) {}
  
  get request() { return this.req }
  get response() { return this.res }
  
  // Request helpers
  param(key: string): string {
    return this.req.params[key] || ''
  }
  
  query(key: string): string | undefined {
    const value = this.req.query[key]
    return typeof value === 'string' ? value : undefined
  }
  
  header(key: string): string | undefined {
    return this.req.get(key)
  }
  
  get url(): string {
    return this.req.url
  }
  
  // Response helpers
  json(data: any, status: number = 200): void {
    this.res.status(status).json(data)
  }
  
  text(text: string, status: number = 200): void {
    this.res.status(status).send(text)
  }
  
  status(code: number): this {
    this.res.status(code)
    return this
  }
  
  setHeader(key: string, value: string): this {
    this.res.set(key, value)
    return this
  }
}

// Wrapper to convert Express handlers to our context format
function createHandler(handlerFn: (ctx: ExpressContext) => Promise<void>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ctx = new ExpressContext(req, res)
      await handlerFn(ctx)
    } catch (error) {
      next(error)
    }
  }
}

export async function registerExpressRoutes(app: Express, storageClient: StorageClient | null) {
  // === CORE DISTRIBUTION ENDPOINTS ===
  
  // List apps with enhanced metadata
  app.get('/v1/apps', createHandler(async (c) => {
    try {
      const apps = await getAppsList()
      
      // Enhanced app listing with metadata
      const appsWithMetadata = await Promise.all(
        apps.map(async (appName) => {
          try {
            const index = await readAppIndex(appName)
            if (!index) {
              return {
                name: appName,
                error: 'index_not_readable',
                releases: 0,
                channels: []
              }
            }
            
            return {
              name: appName,
              releases: index.releases.length,
              channels: index.channels || [],
              latestVersion: index.releases.length > 0 ? 
                pickLatestRelease(index, {})?.version || 'unknown' : 
                'none',
              platforms: [...new Set(
                index.releases.flatMap(r => r.assets.map(a => a.platform))
              )]
            }
          } catch (error) {
            console.error(`Error getting metadata for app ${appName}:`, error)
            return {
              name: appName,
              error: 'metadata_error',
              releases: 0,
              channels: []
            }
          }
        })
      )
      
      c.json({ 
        apps: appsWithMetadata,
        total: apps.length,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('Apps listing error:', error)
      c.json({ 
        error: 'apps_listing_failed', 
        message: 'Failed to list applications',
        timestamp: new Date().toISOString()
      }, 500)
    }
  }))

  // Get all releases for an app
  app.get('/v1/apps/:app/releases', createHandler(async (c) => {
    const appName = c.param('app')
    const channel = c.query('channel')
    const index = await readAppIndex(appName)
    if (!index) {
      c.json({ error: 'not_found' }, 404)
      return
    }

    if (!channel) {
      c.json(index)
      return
    }

    const filtered = {
      ...index,
      releases: index.releases.filter((r) => r.channel === channel),
    }
    c.json(filtered)
  }))

  // Latest release for app (by channel/platform) with progressive rollout support
  app.get('/v1/apps/:app/releases/latest', createHandler(async (c) => {
    const appName = c.param('app')
    const channel = c.query('channel') || undefined
    const platform = c.query('platform') || undefined
    const userId = c.query('user_id') || c.header('x-user-id') || undefined
    
    const index = await readAppIndex(appName)
    if (!index) {
      c.json({ error: 'not_found' }, 404)
      return
    }

    const latest = pickLatestRelease(index, { channel, platform })
    if (!latest) {
      c.json({ error: 'no_release' }, 404)
      return
    }
    
    // Check if user should get this release based on rollout strategy
    const shouldReceiveRelease = await shouldUserGetRelease(appName, latest.version, userId)
    
    if (!shouldReceiveRelease) {
      // Find previous stable release
      const stableReleases = index.releases
        .filter(r => r.channel === 'stable' && r.version !== latest.version)
        .filter(r => platform ? r.assets.some(a => a.platform === platform) : true)
        .sort((a, b) => semver.rcompare(a.version, b.version))
      
      const fallbackRelease = stableReleases[0]
      if (fallbackRelease) {
        c.json(fallbackRelease)
        return
      }
    }
    
    c.json(latest)
  }))

  // Specific version metadata
  app.get('/v1/apps/:app/releases/:version', createHandler(async (c) => {
    const appName = c.param('app')
    const version = c.param('version')
    const index = await readAppIndex(appName)
    if (!index) {
      c.json({ error: 'not_found' }, 404)
      return
    }

    const rel = findReleaseByVersion(index, version)
    if (!rel) {
      c.json({ error: 'not_found' }, 404)
      return
    }
    c.json(rel)
  }))

  // Enhanced download endpoint with robust error handling and caching
  app.get('/v1/apps/:app/releases/:version/download', createHandler(async (c) => {
    const downloadStartTime = Date.now()
    const appName = c.param('app')
    const version = c.param('version')
    const platform = c.query('platform')
    
    // Input validation
    if (!platform) {
      c.json({ 
        error: 'platform_required', 
        message: 'Platform parameter is required',
        supportedPlatforms: ['windows-x86_64', 'windows-aarch64', 'macos-x86_64', 'macos-aarch64', 'linux-x86_64', 'linux-aarch64']
      }, 400)
      return
    }

    // Validate app name format
    if (!/^[a-zA-Z0-9_-]+$/.test(appName)) {
      c.json({ error: 'invalid_app_name', message: 'App name contains invalid characters' }, 400)
      return
    }

    // Validate version format
    if (!/^\d+\.\d+\.\d+/.test(version)) {
      c.json({ error: 'invalid_version', message: 'Version must follow semantic versioning' }, 400)
      return
    }

    try {
      const index = await readAppIndex(appName)
      if (!index) {
        c.json({ 
          error: 'app_not_found', 
          message: `App '${appName}' not found`,
          availableApps: await getAppsList()
        }, 404)
        return
      }
      
      const rel = findReleaseByVersion(index, version)
      if (!rel) {
        const availableVersions = index.releases.map(r => r.version)
        c.json({ 
          error: 'version_not_found', 
          message: `Version '${version}' not found for app '${appName}'`,
          availableVersions
        }, 404)
        return
      }
      
      const asset = rel.assets.find((a) => a.platform === platform)
      if (!asset) {
        const availablePlatforms = rel.assets.map(a => a.platform)
        c.json({ 
          error: 'platform_not_found', 
          message: `Platform '${platform}' not available for version '${version}'`,
          availablePlatforms
        }, 404)
        return
      }

      // Extract client information for analytics
      const userAgent = c.header('user-agent') || 'unknown'
      const clientIP = c.header('x-forwarded-for') || 
                      c.header('x-real-ip') || 
                      c.header('cf-connecting-ip') || 
                      c.header('x-client-ip') ||
                      'unknown'
      
      const region = c.header('cf-ipcountry') || 
                    c.header('x-region') || 
                    'unknown'

      const filePath = join(getAppDir(appName), version, asset.filename)
      
      // Verify file exists and is readable
      const { existsSync, statSync, readFileSync } = await import('node:fs')
      if (!existsSync(filePath)) {
        console.error(`File not found: ${filePath}`)
        c.json({ 
          error: 'file_not_found', 
          message: `Package file '${asset.filename}' not found on server`,
          filename: asset.filename
        }, 404)
        return
      }

      const stats = statSync(filePath)
      const size = stats.size
      const range = c.header('range')
      
      // Set security and caching headers
      c.setHeader('Accept-Ranges', 'bytes')
      c.setHeader('Content-Disposition', `attachment; filename="${asset.filename}"`)
      c.setHeader('X-Content-Type-Options', 'nosniff')
      c.setHeader('X-Frame-Options', 'DENY')
      
      // Add file integrity information if available
      if (asset.sha256) {
        c.setHeader('X-File-SHA256', asset.sha256)
      }
      if (asset.size) {
        c.setHeader('X-File-Size', String(asset.size))
      }
      
      // Set cache headers for better performance
      const lastModified = new Date(rel.pub_date || Date.now()).toUTCString()
      c.setHeader('Last-Modified', lastModified)
      c.setHeader('ETag', `"${asset.sha256 || `${appName}-${version}-${platform}`}"`)
      c.setHeader('Cache-Control', 'public, max-age=86400, immutable') // 24 hours
      
      // Check for conditional requests
      const ifNoneMatch = c.header('if-none-match')
      const ifModifiedSince = c.header('if-modified-since')
      
      if (ifNoneMatch && ifNoneMatch.includes(asset.sha256 || `${appName}-${version}-${platform}`)) {
        c.status(304)
        return
      }
      
      if (ifModifiedSince && new Date(ifModifiedSince) >= new Date(lastModified)) {
        c.status(304)
        return
      }

      // Prepare download metric
      const downloadMetric: DownloadMetric = {
        appName,
        version,
        platform,
        downloadTime: new Date(),
        userAgent,
        ip: clientIP,
        downloadSize: size,
        region
      }

      // Handle range requests
      if (range) {
        const rangeMatch = /^bytes=(\d*)-(\d*)$/.exec(range)
        if (!rangeMatch) {
          c.json({ 
            error: 'invalid_range', 
            message: 'Invalid range format. Use bytes=start-end format.' 
          }, 416)
          return
        }
        
        const hasStart = rangeMatch[1] !== ''
        const hasEnd = rangeMatch[2] !== ''
        let start: number
        let end: number

        try {
          if (hasStart && hasEnd) {
            start = parseInt(rangeMatch[1], 10)
            end = parseInt(rangeMatch[2], 10)
          } else if (hasStart && !hasEnd) {
            start = parseInt(rangeMatch[1], 10)
            end = size - 1
          } else if (!hasStart && hasEnd) {
            const suffixLength = parseInt(rangeMatch[2], 10)
            if (suffixLength <= 0) {
              c.setHeader('Content-Range', `bytes */${size}`)
              c.json({ error: 'invalid_range_suffix' }, 416)
              return
            }
            start = Math.max(size - suffixLength, 0)
            end = size - 1
          } else {
            c.json({ error: 'invalid_range_format' }, 416)
            return
          }

          // Validate range bounds
          if (start < 0 || start >= size || end < start || end >= size) {
            c.setHeader('Content-Range', `bytes */${size}`)
            c.json({ 
              error: 'range_not_satisfiable',
              message: `Range ${start}-${end} not satisfiable for file size ${size}`
            }, 416)
            return
          }

          // Update metric with actual download size
          downloadMetric.downloadSize = end - start + 1
          
          // Log partial download metric (async)
          logDownloadMetric(downloadMetric).catch(err => 
            console.error('Failed to log download metric:', err)
          )

          // Return partial content
          const fileBuffer = readFileSync(filePath)
          const chunk = fileBuffer.subarray(start, end + 1)
          
          c.response.status(206)
          c.response.set('Content-Type', 'application/octet-stream')
          c.response.set('Content-Length', String(end - start + 1))
          c.response.set('Content-Range', `bytes ${start}-${end}/${size}`)
          c.response.set('Accept-Ranges', 'bytes')
          c.response.set('X-Download-Type', 'partial')
          c.response.send(chunk)
          return
          
        } catch (parseError) {
          console.error('Range parsing error:', parseError)
          c.json({ 
            error: 'range_parse_error', 
            message: 'Failed to parse range header' 
          }, 400)
          return
        }
      }

      // Full download
      try {
        const downloadEndTime = Date.now()
        downloadMetric.downloadDuration = downloadEndTime - downloadStartTime
        
        // Log full download metric (async)
        logDownloadMetric(downloadMetric).catch(err => 
          console.error('Failed to log download metric:', err)
        )

        // Read file and send
        const fileBuffer = readFileSync(filePath)
        
        c.response.status(200)
        c.response.set('Content-Type', 'application/octet-stream')
        c.response.set('Content-Length', String(size))
        c.response.set('Accept-Ranges', 'bytes')
        c.response.set('X-Download-Type', 'full')
        c.response.set('X-App-Name', appName)
        c.response.set('X-App-Version', version)
        c.response.set('X-Platform', platform)
        c.response.send(fileBuffer)
        
      } catch (streamError) {
        console.error('File streaming error:', streamError)
        c.json({ 
          error: 'stream_error', 
          message: 'Failed to stream file content',
          details: String(streamError)
        }, 500)
      }
      
    } catch (error) {
      console.error('Download endpoint error:', error)
      
      if (error instanceof Error) {
        c.json({ 
          error: 'download_failed', 
          message: 'Download request failed',
          details: error.message,
          timestamp: new Date().toISOString()
        }, 500)
      } else {
        c.json({ 
          error: 'unknown_error', 
          message: 'An unknown error occurred during download',
          timestamp: new Date().toISOString()
        }, 500)
      }
    }
  }))

  // Add more route handlers as needed...
  // (I'll implement the most critical ones for now)

  // Error handling middleware
  app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('Express route error:', error)
    
    if (!res.headersSent) {
      res.status(500).json({
        error: 'internal_server_error',
        message: 'An internal server error occurred',
        timestamp: new Date().toISOString()
      })
    }
  })

  console.log('✅ Express routes registered successfully')
}