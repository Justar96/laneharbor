"use client"

import type { MetaFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link, useSearchParams } from "@remix-run/react";
import { useState, useCallback, useRef, useEffect } from "react";
import React from "react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Progress } from "../components/ui/progress";
import { Typewriter } from "../components/ui/typewriter";
import { Download, Github, Search, Filter, MoreVertical, ExternalLink, RefreshCw, AlertCircle, CheckCircle2, Package, Clock, Users, TrendingUp, Info } from 'lucide-react';
import { LaneHarborIcon } from "../components/ui/laneharbor-icon";
import { getApiBaseUrl } from "../lib/env";
import { LaneHarborAPI, LaneHarborRealtimeConnector, formatBytes, formatBandwidth, formatTime } from "../lib/api";

type ProgressStatus = "idle" | "connecting" | "downloading" | "completed" | "error" | "paused"

interface ProgressState {
  id: string
  status: ProgressStatus
  progress: number
  speed: number // bytes per second
  totalSize: number
  downloadedSize: number
  filename: string
  error?: string
  startTime?: number
  estimatedTimeRemaining?: number
}

interface ProgressConfig {
  enableRealTime: boolean
  maxConcurrentDownloads: number
  chunkSize: number
  retryAttempts: number
}

export const meta: MetaFunction = () => {
  return [
    { title: "LaneHarbor - App Distribution Platform" },
    { name: "description", content: "Modern app distribution and release management" },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);

  // Use the centralized API base URL function
  const apiBaseUrl = getApiBaseUrl();
  
  // Extract URL parameters for configuration
  const searchParams = url.searchParams;
  const urlConfig = {
    filename: searchParams.get("filename") || "demo-app.zip",
    size: Number.parseInt(searchParams.get("size") || "2457600"), // Default 2.4MB
    autoStart: searchParams.get("autostart") === "true",
    theme: searchParams.get("theme") || "gray",
    title: searchParams.get("title") || "LaneHarbor",
    subtitle: searchParams.get("subtitle") || "Download update server with",
    showFeatures: searchParams.get("features") !== "false",
    maxSpeed: Number.parseInt(searchParams.get("maxspeed") || "5242880"), // Default 5MB/s max
  };
  
  try {
    // Add timeout and proper error handling to prevent redirect loops
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    const response = await fetch(`${apiBaseUrl}/v1/apps`, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'LaneHarbor-Frontend/1.0'
      }
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    return json({ apps: data.apps || [], baseUrl: apiBaseUrl, urlConfig, error: null });
  } catch (error) {
    console.error('Failed to fetch apps from backend:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch apps';
    return json({ apps: [], baseUrl: apiBaseUrl, urlConfig, error: errorMessage });
  }
}

export default function LaneHarborPage() {
  const { apps, baseUrl, urlConfig, error } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  
  const [downloads, setDownloads] = useState<Map<string, ProgressState>>(new Map());
  const [selectedApp, setSelectedApp] = useState<string>("");
  const [releases, setReleases] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [sortBy, setSortBy] = useState<"name" | "releases" | "latest">("name");
  
  // Initialize API client
  const api = useRef(new LaneHarborAPI(baseUrl));
  const realtimeConnector = useRef<LaneHarborRealtimeConnector | null>(null);

  // Filter and sort apps
  const filteredApps = apps.filter(app => 
    app.name.toLowerCase().includes(searchQuery.toLowerCase())
  ).sort((a, b) => {
    switch (sortBy) {
      case "releases":
        return b.releases - a.releases;
      case "latest":
        return (b.latestVersion || "").localeCompare(a.latestVersion || "");
      default:
        return a.name.localeCompare(b.name);
    }
  });

  const fetchReleases = async (appName: string) => {
    setLoading(true);
    try {
      const data = await api.current.getAppReleases(appName);
      setReleases(data.releases || []);
    } catch (err) {
      console.error("Failed to fetch releases:", err);
      setReleases([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAppSelect = (appName: string) => {
    setSelectedApp(appName);
    if (appName) {
      fetchReleases(appName);
    } else {
      setReleases([]);
    }
  };

  // Real download function
  const startRealDownload = useCallback(
    async (appName: string, version: string, platform: string) => {
      const downloadId = `${appName}-${version}-${platform}-${Date.now()}`;
      
      const initialState: ProgressState = {
        id: downloadId,
        status: "connecting",
        progress: 0,
        speed: 0,
        totalSize: 0,
        downloadedSize: 0,
        filename: `${appName}-${version}-${platform}`,
        startTime: Date.now(),
      };

      setDownloads((prev) => new Map(prev.set(downloadId, initialState)));

      try {
        // Get download info first
        const downloadInfo = await api.current.downloadFile(appName, version, platform);
        
        setDownloads((prev) => {
          const updated = new Map(prev);
          const current = updated.get(downloadId);
          if (current) {
            updated.set(downloadId, {
              ...current,
              status: "downloading",
              totalSize: downloadInfo.size,
              filename: downloadInfo.filename,
            });
          }
          return updated;
        });

        // Start actual download with progress tracking
        const blob = await api.current.downloadWithProgress(
          appName,
          version,
          platform,
          (progress) => {
            setDownloads((prev) => {
              const updated = new Map(prev);
              const current = updated.get(downloadId);
              if (current) {
                const elapsed = (Date.now() - (current.startTime || Date.now())) / 1000;
                const speed = elapsed > 0 ? progress.loaded / elapsed : 0;
                const eta = speed > 0 ? (progress.total - progress.loaded) / speed : 0;

                updated.set(downloadId, {
                  ...current,
                  progress: progress.percentage,
                  downloadedSize: progress.loaded,
                  totalSize: progress.total,
                  speed,
                  estimatedTimeRemaining: eta,
                });
              }
              return updated;
            });
          }
        );

        // Download completed
        setDownloads((prev) => {
          const updated = new Map(prev);
          const current = updated.get(downloadId);
          if (current) {
            updated.set(downloadId, {
              ...current,
              status: "completed",
              progress: 100,
              downloadedSize: current.totalSize,
            });
          }
          return updated;
        });

        // Trigger browser download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = downloadInfo.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

      } catch (error) {
        console.error('Download failed:', error);
        setDownloads((prev) => {
          const updated = new Map(prev);
          const current = updated.get(downloadId);
          if (current) {
            updated.set(downloadId, {
              ...current,
              status: "error",
              error: error instanceof Error ? error.message : 'Download failed',
            });
          }
          return updated;
        });
      }

      return downloadId;
    },
    [api]
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100 dark:from-slate-900 dark:to-gray-900">
      <header className="border-b bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 lg:px-6">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl shadow-lg">
                  <LaneHarborIcon className="h-6 w-6 text-white" size={24} />
                </div>
                <div>
                  <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                    LaneHarbor
                  </h1>
                  <p className="text-xs text-muted-foreground">App Distribution Platform</p>
                </div>
              </div>
              <Badge variant="outline" className="text-xs">
                v1.0.0
              </Badge>
            </div>

            <div className="flex items-center space-x-4">
              <div className="hidden md:flex items-center space-x-2 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                <Button
                  variant={viewMode === "grid" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("grid")}
                  className="h-8"
                >
                  <Package className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "list" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("list")}
                  className="h-8"
                >
                  <Filter className="h-4 w-4" />
                </Button>
              </div>
              
              <Button variant="ghost" size="sm" asChild>
                <a href="https://github.com/Justar96/laneharbor" target="_blank" rel="noopener noreferrer">
                  <Github className="h-4 w-4" />
                  <ExternalLink className="h-3 w-3 ml-1" />
                </a>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 lg:px-6 py-8">
        {error && (
          <Card className="mb-6 border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20">
            <CardContent className="flex items-center gap-3 py-4">
              <AlertCircle className="h-5 w-5 text-red-500" />
              <div>
                <h3 className="font-medium text-red-800 dark:text-red-200">Connection Error</h3>
                <p className="text-sm text-red-600 dark:text-red-300">
                  Unable to fetch apps from the API: {error}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Hero Section */}
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            <span>Distribute apps with </span>
            <Typewriter
              text={["real-time updates", "gRPC efficiency", "live monitoring", "instant delivery"]}
              speed={80}
              className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent"
              waitTime={2000}
              deleteSpeed={50}
              cursorChar="_"
              cursorClassName="ml-0"
            />
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
            Modern app distribution platform with gRPC microservices, real-time progress tracking, 
            and comprehensive analytics for seamless software delivery.
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-blue-200 dark:border-blue-700">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">Total Apps</p>
                  <p className="text-3xl font-bold text-blue-900 dark:text-blue-100">{apps.length}</p>
                </div>
                <Package className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 border-green-200 dark:border-green-700">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-green-600 dark:text-green-400 font-medium">Total Releases</p>
                  <p className="text-3xl font-bold text-green-900 dark:text-green-100">
                    {apps.reduce((sum, app) => sum + (app.releases || 0), 0)}
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 border-purple-200 dark:border-purple-700">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-purple-600 dark:text-purple-400 font-medium">Active Downloads</p>
                  <p className="text-3xl font-bold text-purple-900 dark:text-purple-100">
                    {Array.from(downloads.values()).filter(d => d.status === "downloading").length}
                  </p>
                </div>
                <Download className="h-8 w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 border-orange-200 dark:border-orange-700">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-orange-600 dark:text-orange-400 font-medium">Success Rate</p>
                  <p className="text-3xl font-bold text-orange-900 dark:text-orange-100">99.8%</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search applications..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="name">Sort by Name</option>
            <option value="releases">Sort by Releases</option>
            <option value="latest">Sort by Latest Version</option>
          </select>
        </div>

        {/* Apps Grid/List */}
        {filteredApps.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No Apps Found</h3>
              <p className="text-gray-600 dark:text-gray-400">
                {searchQuery ? 'Try adjusting your search query' : 'No applications are currently available'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className={`grid gap-6 ${viewMode === "grid" ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3" : "grid-cols-1"}`}>
            {filteredApps.map((app) => (
              <Card key={app.name} className="group hover:shadow-lg transition-all duration-300 border-2 hover:border-blue-200 dark:hover:border-blue-700">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                        <Package className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <CardTitle className="text-lg group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                          {app.name}
                        </CardTitle>
                        {app.error && (
                          <p className="text-sm text-red-500 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            {app.error}
                          </p>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleAppSelect(selectedApp === app.name ? "" : app.name)}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{app.releases}</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">Releases</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{app.latestVersion || 'N/A'}</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">Latest</p>
                    </div>
                  </div>
                  
                  {app.platforms && app.platforms.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">Platforms</p>
                      <div className="flex flex-wrap gap-1">
                        {app.platforms.slice(0, 3).map((platform) => (
                          <Badge key={platform} variant="secondary" className="text-xs">
                            {platform}
                          </Badge>
                        ))}
                        {app.platforms.length > 3 && (
                          <Badge variant="secondary" className="text-xs">
                            +{app.platforms.length - 3} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex space-x-2">
                    <Button
                      onClick={() => handleAppSelect(app.name)}
                      className="flex-1"
                      variant={selectedApp === app.name ? "default" : "outline"}
                      size="sm"
                    >
                      {selectedApp === app.name ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Selected
                        </>
                      ) : (
                        <>
                          <Info className="h-4 w-4 mr-1" />
                          View Releases
                        </>
                      )}
                    </Button>
                    
                    {app.latestVersion && !app.error && (
                      <Button
                        onClick={() => {
                          if (app.platforms && app.platforms.length > 0) {
                            startRealDownload(app.name, app.latestVersion, app.platforms[0]);
                          }
                        }}
                        size="sm"
                        className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Selected App Details */}
        {selectedApp && (
          <Card className="mt-8 border-2 border-blue-200 dark:border-blue-700">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl flex items-center gap-3">
                  <Package className="h-6 w-6 text-blue-500" />
                  {selectedApp} - Releases
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleAppSelect("")}
                >
                  ×
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-blue-500 mr-2" />
                  Loading releases...
                </div>
              ) : releases.length === 0 ? (
                <div className="text-center py-8 text-gray-600 dark:text-gray-400">
                  No releases found for this app
                </div>
              ) : (
                <div className="space-y-4">
                  {releases.map((release) => (
                    <Card key={release.version} className="border border-gray-200 dark:border-gray-700">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className="font-mono">
                              v{release.version}
                            </Badge>
                            <Badge variant={release.channel === 'stable' ? 'default' : 'secondary'}>
                              {release.channel || 'stable'}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                            <Clock className="h-4 w-4" />
                            {new Date(release.pub_date).toLocaleDateString()}
                          </div>
                        </div>
                        
                        {release.notes && (
                          <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">{release.notes}</p>
                        )}
                        
                        <div className="flex flex-wrap gap-2">
                          {release.assets?.map((asset: any) => (
                            <Button
                              key={`${asset.platform}-${asset.filename}`}
                              onClick={() => startRealDownload(selectedApp, release.version, asset.platform)}
                              variant="outline"
                              size="sm"
                              className="flex items-center gap-2"
                            >
                              <Download className="h-3 w-3" />
                              {asset.platform}
                              {asset.size && (
                                <span className="text-xs text-gray-500">
                                  ({formatBytes(asset.size)})
                                </span>
                              )}
                            </Button>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Download Progress */}
        {downloads.size > 0 && (
          <Card className="mt-8 border-2 border-green-200 dark:border-green-700 bg-green-50 dark:bg-green-900/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <Download className="h-5 w-5 text-green-500" />
                Active Downloads
                <Badge variant="secondary">{downloads.size}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {Array.from(downloads.values()).map((download) => (
                <div key={download.id} className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${
                        download.status === 'completed' ? 'bg-green-500' :
                        download.status === 'error' ? 'bg-red-500' :
                        download.status === 'downloading' ? 'bg-blue-500 animate-pulse' :
                        'bg-gray-400'
                      }`} />
                      <span className="font-medium">{download.filename}</span>
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 capitalize">
                      {download.status}
                    </div>
                  </div>
                  
                  <Progress value={download.progress} className="mb-2" />
                  
                  <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                    <span>{Math.round(download.progress)}%</span>
                    <span>{formatBytes(download.downloadedSize)} / {formatBytes(download.totalSize)}</span>
                  </div>
                  
                  {download.speed > 0 && (
                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-500 mt-1">
                      <span>Speed: {formatBandwidth(download.speed)}</span>
                      {download.estimatedTimeRemaining && (
                        <span>ETA: {formatTime(download.estimatedTimeRemaining)}</span>
                      )}
                    </div>
                  )}
                  
                  {download.error && (
                    <p className="text-sm text-red-500 mt-2 flex items-center gap-1">
                      <AlertCircle className="h-4 w-4" />
                      {download.error}
                    </p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </main>

      <footer className="border-t bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm mt-16">
        <div className="container mx-auto px-4 lg:px-6 py-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center space-x-3 mb-4 md:mb-0">
              <LaneHarborIcon className="h-6 w-6 text-gray-600 dark:text-gray-400" size={24} />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                © 2024 LaneHarbor. Open source under MIT License.
              </span>
            </div>
            <div className="flex space-x-6 text-sm text-gray-600 dark:text-gray-400">
              <a href="https://github.com/Justar96/laneharbor" className="hover:text-gray-900 dark:hover:text-gray-200 flex items-center gap-1">
                <Github className="h-4 w-4" />
                GitHub
              </a>
              <a href="#" className="hover:text-gray-900 dark:hover:text-gray-200">Documentation</a>
              <a href="#" className="hover:text-gray-900 dark:hover:text-gray-200">API Reference</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
