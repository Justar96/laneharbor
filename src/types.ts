export type Platform =
  | 'windows-x86_64'
  | 'windows-aarch64'
  | 'macos-x86_64'
  | 'macos-aarch64'
  | 'linux-x86_64'
  | 'linux-aarch64'

export interface ReleaseAsset {
  platform: Platform | string
  filename: string
  sha256?: string
  size?: number
  url?: string
  signature?: string
}

export interface ReleaseEntry {
  version: string
  channel: string
  pub_date?: string
  notes?: string
  assets: ReleaseAsset[]
}

export interface AppIndex {
  app: string
  channels: string[]
  releases: ReleaseEntry[]
}

// === ANALYTICS & INSIGHTS ===
export interface DownloadMetric {
  appName: string
  version: string
  platform: Platform | string
  downloadTime: Date
  userAgent?: string
  ip?: string
  downloadSize: number
  downloadDuration?: number
  region?: string
}

export interface AppInsights {
  totalDownloads: number
  popularPlatforms: { platform: string; count: number; percentage: number }[]
  downloadTrends: { date: string; downloads: number }[]
  averageDownloadTime: number
  peakDownloadHours: number[]
  // TODO: Add AI-powered insights
  predictedOptimalReleaseTime?: Date
  recommendedPlatformPriority?: Platform[]
  anomalyDetection?: {
    hasAnomalies: boolean
    anomalies: string[]
  }
}

export interface GlobalAnalytics {
  totalApps: number
  totalDownloads: number
  topApps: { appName: string; downloads: number }[]
  platformDistribution: { platform: string; percentage: number }[]
  dailyActiveApps: number
  // TODO: Cross-app AI insights
  marketTrends?: string[]
  recommendedActions?: string[]
}

// === SECURITY & VALIDATION ===
export interface SecurityCheck {
  fileHash: string
  hashAlgorithm: 'SHA-256' | 'SHA-512'
  virusScanResult?: 'clean' | 'suspicious' | 'infected' | 'pending'
  signatureValid: boolean
  fileIntegrity: boolean
  scanTimestamp: Date
  // TODO: AI-powered security analysis
  riskScore?: number
  threatIndicators?: string[]
  recommendedActions?: string[]
}

export interface ReleaseProvenance {
  buildEnvironment: string
  sourceCommit: string
  buildTimestamp: Date
  signingCertificate?: string
  dependencies: string[]
  buildTools: string[]
  // TODO: Supply chain risk analysis
  supplyChainScore?: number
  vulnerabilityReport?: {
    critical: number
    high: number
    medium: number
    low: number
  }
}

// === PROGRESSIVE DEPLOYMENT ===
export type RolloutStrategy = 'immediate' | 'gradual' | 'canary' | 'blue-green'

export interface RolloutConfig {
  strategy: RolloutStrategy
  percentage?: number // For gradual rollouts (0-100)
  targetGroups?: string[] // For canary releases
  autoPromote?: boolean
  rollbackThreshold?: number // Error rate threshold for auto-rollback
  // TODO: AI-powered rollout optimization
  predictedSuccessRate?: number
  recommendedStrategy?: RolloutStrategy
  riskAssessment?: 'low' | 'medium' | 'high'
}

export interface DeploymentMetrics {
  rolloutId: string
  appName: string
  version: string
  strategy: RolloutStrategy
  startTime: Date
  currentPercentage: number
  successfulDownloads: number
  failedDownloads: number
  errorRate: number
  avgDownloadTime: number
  // TODO: Real-time AI monitoring
  healthScore?: number
  predictedOutcome?: 'success' | 'failure' | 'rollback_recommended'
}

// === CDN & DISTRIBUTION ===
export interface DistributionConfig {
  enableCDN: boolean
  cdnBaseUrl?: string
  geoRouting: boolean
  cacheStrategy: 'aggressive' | 'moderate' | 'minimal'
  regions: string[]
  // TODO: AI-optimized distribution
  dynamicRouting?: boolean
  predictivePreloading?: boolean
  loadBalancingStrategy?: string
}

export interface DistributionMetrics {
  region: string
  cacheHitRate: number
  avgLatency: number
  errorRate: number
  bandwidth: number
  // TODO: Performance predictions
  optimizationSuggestions?: string[]
  predictedPerformance?: number
}
