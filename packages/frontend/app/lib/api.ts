// API integration layer for LaneHarbor backend
export interface AppInfo {
  name: string;
  releases: number;
  channels: string[];
  latestVersion: string;
  platforms: string[];
  error?: string;
}

export interface ReleaseInfo {
  version: string;
  channel: string;
  pub_date: string;
  notes?: string;
  assets: AssetInfo[];
}

export interface AssetInfo {
  platform: string;
  filename: string;
  size?: number;
  sha256?: string;
  signature?: string;
  url?: string;
}

export interface DownloadResponse {
  url: string;
  filename: string;
  size: number;
  sha256?: string;
}

export class LaneHarborAPI {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  // REST API methods
  async getApps(): Promise<{ apps: AppInfo[]; total: number }> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/apps`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch apps:', error);
      return { apps: [], total: 0 };
    }
  }

  async getAppReleases(appName: string, channel?: string): Promise<{ releases: ReleaseInfo[] }> {
    try {
      const url = new URL(`${this.baseUrl}/v1/apps/${encodeURIComponent(appName)}/releases`);
      if (channel) {
        url.searchParams.set('channel', channel);
      }
      
      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch releases:', error);
      return { releases: [] };
    }
  }

  async getLatestRelease(appName: string, platform?: string, channel?: string): Promise<ReleaseInfo | null> {
    try {
      const url = new URL(`${this.baseUrl}/v1/apps/${encodeURIComponent(appName)}/releases/latest`);
      if (platform) url.searchParams.set('platform', platform);
      if (channel) url.searchParams.set('channel', channel);
      
      const response = await fetch(url.toString());
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch latest release:', error);
      return null;
    }
  }

  async downloadFile(appName: string, version: string, platform: string): Promise<DownloadResponse> {
    const url = `${this.baseUrl}/v1/apps/${encodeURIComponent(appName)}/releases/${encodeURIComponent(version)}/download?platform=${encodeURIComponent(platform)}`;
    
    try {
      const response = await fetch(url, { method: 'HEAD' }); // Check headers first
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const filename = response.headers.get('content-disposition')?.split('filename=')[1]?.replace(/"/g, '') || 'download';
      const size = parseInt(response.headers.get('content-length') || '0');
      const sha256 = response.headers.get('x-file-sha256') || undefined;

      return {
        url,
        filename,
        size,
        sha256
      };
    } catch (error) {
      console.error('Failed to get download info:', error);
      throw error;
    }
  }

  // Streaming download with progress tracking
  async downloadWithProgress(
    appName: string, 
    version: string, 
    platform: string,
    onProgress?: (progress: { loaded: number; total: number; percentage: number }) => void
  ): Promise<Blob> {
    const downloadInfo = await this.downloadFile(appName, version, platform);
    
    const response = await fetch(downloadInfo.url);
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Failed to get response reader');
    }

    const contentLength = downloadInfo.size;
    let receivedLength = 0;
    const chunks: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;
      
      chunks.push(value);
      receivedLength += value.length;
      
      if (onProgress && contentLength > 0) {
        const percentage = (receivedLength / contentLength) * 100;
        onProgress({
          loaded: receivedLength,
          total: contentLength,
          percentage
        });
      }
    }

    return new Blob(chunks as BlobPart[]);
  }

  // Health check
  async getHealthStatus(): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/healthz`);
      return await response.json();
    } catch (error) {
      console.error('Health check failed:', error);
      return { status: 'error', error: error.message };
    }
  }

  // Analytics endpoints
  async getAppAnalytics(appName: string, timeRange = '30d'): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/apps/${encodeURIComponent(appName)}/analytics?timeRange=${timeRange}`);
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
      return null;
    }
  }

  async getGlobalAnalytics(timeRange = '30d', includeAI = false): Promise<any> {
    try {
      const url = new URL(`${this.baseUrl}/v1/analytics/dashboard`);
      url.searchParams.set('timeRange', timeRange);
      if (includeAI) url.searchParams.set('ai', 'true');
      
      const response = await fetch(url.toString());
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch global analytics:', error);
      return null;
    }
  }
}

// gRPC-like real-time connector (WebSocket-based for web compatibility)
export class LaneHarborRealtimeConnector {
  private ws: WebSocket | null = null;
  private baseUrl: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  constructor(baseUrl: string) {
    // Convert HTTP URL to WebSocket URL
    this.baseUrl = baseUrl.replace(/^http/, 'ws') + '/ws';
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.baseUrl);
        
        this.ws.onopen = () => {
          console.log('WebSocket connected');
          this.reconnectAttempts = 0;
          resolve();
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        };

        this.ws.onclose = () => {
          console.log('WebSocket disconnected');
          this.attemptReconnect();
        };

      } catch (error) {
        reject(error);
      }
    });
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      
      setTimeout(() => {
        this.connect().catch(console.error);
      }, this.reconnectDelay * this.reconnectAttempts);
    }
  }

  subscribeToDownloadProgress(downloadId: string, callback: (progress: any) => void) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not connected');
      return;
    }

    this.ws.send(JSON.stringify({
      type: 'subscribe',
      topic: 'download_progress',
      downloadId
    }));

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'download_progress' && data.downloadId === downloadId) {
          callback(data.progress);
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };
  }

  subscribeToSystemStatus(callback: (status: any) => void) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not connected');
      return;
    }

    this.ws.send(JSON.stringify({
      type: 'subscribe',
      topic: 'system_status'
    }));

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'system_status') {
          callback(data.status);
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

// Utility functions
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function formatBandwidth(bytesPerSecond: number): string {
  return formatBytes(bytesPerSecond) + '/s';
}

export function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '--';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}
