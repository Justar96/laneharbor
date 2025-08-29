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

// === PACKAGE ANALYSIS & UPLOAD ===
export interface PackageUploadRequest {
  appName: string
  version: string
  channel: string
  platform: Platform | string
  file: File | Blob
  notes?: string
  // Optional metadata override
  metadata?: Partial<PackageMetadata>
}

export interface PackageMetadata {
  filename: string
  size: number
  mimeType: string
  uploadTimestamp: Date
  uploader?: string
  // File characteristics
  isExecutable: boolean
  isArchive: boolean
  isInstaller: boolean
  // Extracted metadata
  extractedInfo: {
    productName?: string
    version?: string
    description?: string
    company?: string
    copyright?: string
    buildDate?: Date
    architecture?: string
  }
  // TODO: AI-extracted insights
  aiAnalysis?: {
    contentType: string
    suspiciousPatterns: string[]
    qualityScore: number
    similarPackages: string[]
  }
}

export interface PackageAnalysisResult {
  metadata: PackageMetadata
  security: SecurityCheck
  structure: PackageStructure
  dependencies: DependencyAnalysis
  compliance: ComplianceCheck
  // TODO: AI-powered insights
  aiInsights?: {
    riskAssessment: 'low' | 'medium' | 'high'
    recommendedActions: string[]
    similarityAnalysis: {
      matchingPackages: string[]
      anomalies: string[]
    }
    qualityMetrics: {
      codeQuality: number
      securityScore: number
      performanceScore: number
    }
  }
}

export interface PackageStructure {
  totalFiles: number
  directories: string[]
  executableFiles: string[]
  configFiles: string[]
  dataFiles: string[]
  // Archive analysis (for .zip, .tar.gz, etc.)
  archiveInfo?: {
    compressionRatio: number
    originalSize: number
    compressedSize: number
    entries: ArchiveEntry[]
  }
  // Executable analysis (for .exe, .app, .deb, etc.)
  executableInfo?: {
    format: string // PE, ELF, Mach-O, etc.
    architecture: string
    subsystem: string
    dependencies: string[]
    digitalSignature?: {
      isSigned: boolean
      issuer?: string
      validFrom?: Date
      validTo?: Date
    }
  }
}

export interface ArchiveEntry {
  path: string
  size: number
  compressedSize: number
  isDirectory: boolean
  modificationTime?: Date
}

export interface DependencyAnalysis {
  runtimeDependencies: Dependency[]
  buildDependencies: Dependency[]
  systemRequirements: SystemRequirement[]
  // TODO: AI-powered dependency insights
  aiAnalysis?: {
    vulnerableDependencies: string[]
    outdatedDependencies: string[]
    recommendedUpdates: DependencyUpdate[]
    riskScore: number
  }
}

export interface Dependency {
  name: string
  version: string
  type: 'runtime' | 'build' | 'system'
  source?: string
  license?: string
  vulnerabilities?: Vulnerability[]
}

export interface SystemRequirement {
  type: 'os' | 'runtime' | 'hardware'
  name: string
  version?: string
  optional: boolean
}

export interface Vulnerability {
  id: string // CVE ID or similar
  severity: 'critical' | 'high' | 'medium' | 'low'
  description: string
  fixedIn?: string
  publishedDate: Date
}

export interface DependencyUpdate {
  dependency: string
  currentVersion: string
  recommendedVersion: string
  reason: string
  breaking: boolean
}

export interface ComplianceCheck {
  licenseCompliance: {
    detected: string[]
    conflicts: string[]
    recommendations: string[]
  }
  securityStandards: {
    [standard: string]: {
      compliant: boolean
      issues: string[]
      score: number
    }
  }
  // TODO: AI-powered compliance analysis
  aiCompliance?: {
    riskLevel: 'low' | 'medium' | 'high'
    regulatoryIssues: string[]
    recommendedActions: string[]
  }
}

// === UPLOAD WORKFLOW ===
export interface UploadSession {
  sessionId: string
  appName: string
  version: string
  platform: Platform | string
  status: 'uploading' | 'analyzing' | 'validating' | 'complete' | 'failed'
  progress: number // 0-100
  startTime: Date
  completionTime?: Date
  error?: string
  // Analysis results (populated as they complete)
  analysis?: Partial<PackageAnalysisResult>
  // TODO: AI-powered upload optimization
  aiOptimization?: {
    uploadStrategy: string
    compressionRecommendation: string
    estimatedProcessingTime: number
  }
}

// === PROGRESS TRACKING ===
export interface UploadProgress {
  sessionId: string
  percent: number
  transferred: number
  total: number
  speed?: number // bytes per second
  eta?: number // seconds remaining
}

export interface DownloadProgress {
  sessionId: string
  percent: number
  transferred: number
  total: number
  speed?: number // bytes per second
  eta?: number // seconds remaining
}
