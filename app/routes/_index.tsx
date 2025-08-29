"use client"

import type { MetaFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link, useSearchParams } from "@remix-run/react";
import { useState, useCallback, useRef, useEffect } from "react";
import React from "react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Progress } from "../components/ui/progress";
import { Typewriter } from "../components/ui/typewriter";
import { Download, Github } from 'lucide-react';
import { LaneHarborIcon } from "../components/ui/laneharbor-icon";
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
  const baseUrl = `${url.protocol}//${url.host}`;
  
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
    const response = await fetch(`${baseUrl}/v1/apps`);
    const data = await response.json();
    return json({ apps: data.apps || [], baseUrl, urlConfig, error: null });
  } catch (error) {
    return json({ apps: [], baseUrl, urlConfig, error: "Failed to fetch apps" });
  }
}

export default function LaneHarborPage() {
  const { apps, baseUrl, urlConfig, error } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  
  const [downloads, setDownloads] = useState<Map<string, ProgressState>>(new Map());
  const [config, setConfig] = useState<ProgressConfig>({
    enableRealTime: true,
    maxConcurrentDownloads: Number.parseInt(searchParams.get("concurrent") || "3"),
    chunkSize: Number.parseInt(searchParams.get("chunk") || "1048576"), // 1MB chunks
    retryAttempts: Number.parseInt(searchParams.get("retries") || "3"),
  });
  
  const intervalRefs = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const [selectedApp, setSelectedApp] = useState<string>("");
  const [releases, setReleases] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Initialize API client
  const api = useRef(new LaneHarborAPI(baseUrl));
  const realtimeConnector = useRef<LaneHarborRealtimeConnector | null>(null);

  useEffect(() => {
    if (urlConfig.autoStart && downloads.size === 0) {
      const timer = setTimeout(() => {
        simulateAdvancedDownload(urlConfig.filename, urlConfig.size);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [urlConfig.autoStart, urlConfig.filename, urlConfig.size, downloads.size]);

  const getThemeClasses = () => {
    switch (urlConfig.theme) {
      case "blue":
        return {
          card: "bg-blue-50/50 border-blue-200/30",
          bg: "radial-gradient(circle at 1px 1px, rgba(147,197,253,0.6) 1px, transparent 0)",
          title: "text-blue-900",
          icon: "text-blue-700",
          progress: "bg-blue-100/50 border-blue-200/50",
          button: "bg-blue-600 hover:bg-blue-700",
          text: "text-blue-800",
          muted: "text-blue-600",
        };
      case "green":
        return {
          card: "bg-green-50/50 border-green-200/30",
          bg: "radial-gradient(circle at 1px 1px, rgba(134,239,172,0.6) 1px, transparent 0)",
          title: "text-green-900",
          icon: "text-green-700",
          progress: "bg-green-100/50 border-green-200/50",
          button: "bg-green-600 hover:bg-green-700",
          text: "text-green-800",
          muted: "text-green-600",
        };
      default: // gray
        return {
          card: "bg-gray-50/50 border-gray-200/30",
          bg: "radial-gradient(circle at 1px 1px, rgba(156,163,175,0.4) 1px, transparent 0)",
          title: "text-gray-900",
          icon: "text-gray-700",
          progress: "bg-gray-100/50 border-gray-200/50",
          button: "bg-gray-600 hover:bg-gray-700",
          text: "text-gray-800",
          muted: "text-gray-600",
        };
    }
  };

  const themeClasses = getThemeClasses();

  const calculateProgress = useCallback(
    (state: ProgressState) => {
      if (state.startTime && state.progress > 0) {
        const elapsed = (Date.now() - state.startTime) / 1000;
        const speed = Math.min(state.downloadedSize / elapsed || 0, urlConfig.maxSpeed);
        const remaining = state.totalSize - state.downloadedSize;
        const eta = speed > 0 ? remaining / speed : 0;

        return { ...state, speed, estimatedTimeRemaining: eta };
      }
      return state;
    },
    [urlConfig.maxSpeed],
  );

  const simulateAdvancedDownload = useCallback(
    (filename = urlConfig.filename, totalSize: number = urlConfig.size) => {
      const downloadId = `${filename}-${Date.now()}`;

      const initialState: ProgressState = {
        id: downloadId,
        status: "connecting",
        progress: 0,
        speed: 0,
        totalSize,
        downloadedSize: 0,
        filename,
        startTime: Date.now(),
      };

      setDownloads((prev) => new Map(prev.set(downloadId, initialState)));

      setTimeout(() => {
        setDownloads((prev) => {
          const updated = new Map(prev);
          const current = updated.get(downloadId);
          if (current) {
            updated.set(downloadId, { ...current, status: "downloading" });
          }
          return updated;
        });

        const interval = setInterval(
          () => {
            setDownloads((prev) => {
              const updated = new Map(prev);
              const current = updated.get(downloadId);

              if (!current || current.status !== "downloading") {
                clearInterval(interval);
                intervalRefs.current.delete(downloadId);
                return prev;
              }

              const maxChunkSize = Math.min(config.chunkSize, urlConfig.maxSpeed / 10);
              const baseSpeed = maxChunkSize * (0.5 + Math.random() * 0.5);
              const newDownloaded = Math.min(current.downloadedSize + baseSpeed, current.totalSize);
              const newProgress = (newDownloaded / current.totalSize) * 100;

              if (newProgress >= 100) {
                clearInterval(interval);
                intervalRefs.current.delete(downloadId);
                updated.set(
                  downloadId,
                  calculateProgress({
                    ...current,
                    status: "completed",
                    progress: 100,
                    downloadedSize: current.totalSize,
                  }),
                );
              } else {
                updated.set(
                  downloadId,
                  calculateProgress({
                    ...current,
                    progress: newProgress,
                    downloadedSize: newDownloaded,
                  }),
                );
              }

              return updated;
            });
          },
          150 + Math.random() * 100,
        );

        intervalRefs.current.set(downloadId, interval);
      }, 500);

      return downloadId;
    },
    [config, calculateProgress, urlConfig.filename, urlConfig.size, urlConfig.maxSpeed],
  );

  const generateAdvancedAsciiProgress = (state: ProgressState) => {
    const width = 30;
    const filled = Math.max(0, Math.floor((state.progress / 100) * width));
    const empty = Math.max(0, width - filled);

    // Remove status indicator icons, just show the progress bar
    return `[${"█".repeat(filled)}${"░".repeat(empty)}]`;
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const formatTime = (seconds: number) => {
    if (!seconds || !isFinite(seconds)) return "--";
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  };

  const formatBandwidth = (bytesPerSecond: number) => {
    if (bytesPerSecond === 0) return "0 B/s";
    const k = 1024;
    const sizes = ["B/s", "KB/s", "MB/s", "GB/s"];
    const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
    const value = Number.parseFloat((bytesPerSecond / Math.pow(k, i)).toFixed(1));
    return `${value} ${sizes[i]}`;
  };

  // Initialize real-time connector
  useEffect(() => {
    if (config.enableRealTime) {
      realtimeConnector.current = new LaneHarborRealtimeConnector(baseUrl);
      realtimeConnector.current.connect().catch(console.error);
      
      return () => {
        realtimeConnector.current?.disconnect();
      };
    }
  }, [baseUrl, config.enableRealTime]);

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

  // Real download function that integrates with backend
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

  const handleAppSelect = (appName: string) => {
    setSelectedApp(appName);
    if (appName) {
      fetchReleases(appName);
    } else {
      setReleases([]);
    }
  };

  // Get the most recent download for display
  const currentDownload = Array.from(downloads.values()).sort((a, b) => (b.startTime || 0) - (a.startTime || 0))[0];

  return (
    <div className="h-screen overflow-hidden bg-background flex flex-col">
      <header className="flex-shrink-0">
        <div className="container mx-auto px-6">
          <div className="flex h-14 items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-1.5 bg-card/50 rounded-full border border-border/50 backdrop-blur-sm">
                <LaneHarborIcon
                  className="h-6 w-6 text-foreground"
                  size={24}
                />
              </div>
              <span className="text-lg font-mono text-foreground">
                [{urlConfig.title}]
              </span>
              <Badge variant="outline" className="text-xs font-mono">
                v0.1.1
              </Badge>
            </div>

            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="sm" asChild>
                <a href="https://github.com/Justar96/laneharbor" target="_blank" rel="noopener noreferrer">
                  <Github className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center">
        <div className="container mx-auto px-6 max-w-4xl">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-medium text-foreground mb-3">
              <span>{urlConfig.subtitle} </span>
              <Typewriter
                text={["gRPC connector", "instant updates", "real-time status", "live streaming"]}
                speed={80}
                className="text-foreground"
                waitTime={2000}
                deleteSpeed={50}
                cursorChar="_"
                cursorClassName="ml-0"
              />
            </h1>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Delivers instant status updates via gRPC connector for real-time download management and file
              distribution.
            </p>
          </div>

          <div className="max-w-md mx-auto">
            <Card
              className={`relative overflow-hidden ${themeClasses.card}`}
              style={{
                backgroundImage: themeClasses.bg,
                backgroundSize: "6px 6px",
              }}
            >
              <CardHeader className="pb-2">
                <CardTitle className={`text-sm flex items-center ${themeClasses.title}`}>
                  <Download className={`h-3.5 w-3.5 mr-1.5 ${themeClasses.icon}`} />
                  Download Status
                  {downloads.size > 0 && (
                    <Badge variant="secondary" className="ml-2 text-xs px-1.5 py-0.5">
                      {Array.from(downloads.values()).filter((d) => d.status === "downloading").length} active
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className={`font-mono text-xs ${themeClasses.title}`}>
                          {currentDownload?.filename || urlConfig.filename}
                        </span>
                        <span className={`text-xs ${themeClasses.muted} font-mono`}>
                          {currentDownload ? `${formatBytes(currentDownload.totalSize)} total` : `${formatBytes(urlConfig.size)} total`}
                        </span>
                      </div>
                      {currentDownload?.speed && (
                        <div className="text-right">
                          <div className={`text-xs font-mono ${themeClasses.text}`}>
                            {formatBandwidth(currentDownload.speed)}
                          </div>
                          <div className={`text-xs ${themeClasses.muted} font-mono`}>
                            bandwidth
                          </div>
                        </div>
                      )}
                    </div>

                  <div className={`font-mono ${themeClasses.progress} p-2 rounded border`}>
                    <div className={`text-xs ${themeClasses.muted} mb-2 font-mono`}>
                      <span>
                        {currentDownload?.status === "connecting" && "[CONNECTING]"}
                        {currentDownload?.status === "downloading" && "[DOWNLOADING]"}
                        {currentDownload?.status === "completed" && "[COMPLETE]"}
                        {currentDownload?.status === "error" && "[ERROR]"}
                        {!currentDownload && "[READY]"}
                      </span>
                      {currentDownload?.estimatedTimeRemaining && (
                        <span className="float-right font-mono">
                          ETA: {formatTime(currentDownload.estimatedTimeRemaining)}
                        </span>
                      )}
                    </div>

                    <div
                      className={`${themeClasses.text} tracking-wider text-sm leading-6 py-1 text-center transition-all duration-200 ease-in-out`}
                    >
                      {currentDownload
                        ? generateAdvancedAsciiProgress(currentDownload)
                        : generateAdvancedAsciiProgress({
                            id: "",
                            status: "idle",
                            progress: 0,
                            speed: 0,
                            totalSize: 0,
                            downloadedSize: 0,
                            filename: "",
                          })}
                    </div>

                    <div
                      className={`text-xs ${themeClasses.text} mt-2 font-mono`}
                      style={{
                        borderColor: `${themeClasses.muted.includes("pink") ? "rgb(251 207 232 / 0.5)" : themeClasses.muted.includes("blue") ? "rgb(147 197 253 / 0.5)" : themeClasses.muted.includes("green") ? "rgb(134 239 172 / 0.5)" : "rgb(156 163 175 / 0.5)"}`,
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span>{Math.round(currentDownload?.progress || 0)}%</span>
                        <span>
                          {currentDownload ? formatBytes(currentDownload.downloadedSize) : "0B"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-center pt-1">
                    <Button
                      size="sm"
                      onClick={(event) => {
                        // Add ripple effect
                        const button = event?.currentTarget as HTMLElement;
                        if (button && event) {
                          const mouseEvent = event as React.MouseEvent<HTMLButtonElement>;
                          const ripple = document.createElement('span');
                          ripple.className = 'download-ripple';
                          const rect = button.getBoundingClientRect();
                          const size = Math.max(rect.width, rect.height);
                          const x = mouseEvent.clientX - rect.left - size / 2;
                          const y = mouseEvent.clientY - rect.top - size / 2;
                          ripple.style.left = x + 'px';
                          ripple.style.top = y + 'px';
                          ripple.style.width = ripple.style.height = size + 'px';
                          button.appendChild(ripple);
                          setTimeout(() => ripple.remove(), 600);
                        }

                        if (selectedApp && releases.length > 0) {
                          const latestRelease = releases[0];
                          const firstAsset = latestRelease?.assets?.[0];
                          if (firstAsset) {
                            startRealDownload(selectedApp, latestRelease.version, firstAsset.platform);
                          }
                        } else {
                          simulateAdvancedDownload();
                        }
                      }}
                      disabled={Array.from(downloads.values()).some((d) => d.status === "downloading" || d.status === "connecting")}
                      className={`download-button h-7 px-4 text-xs font-medium relative ${
                        Array.from(downloads.values()).some((d) => d.status === "downloading")
                          ? 'loading'
                          : currentDownload?.status === "error"
                          ? 'error'
                          : ''
                      } ${themeClasses.button} text-white`}
                      style={{
                        cursor: Array.from(downloads.values()).some((d) => d.status === "downloading" || d.status === "connecting")
                          ? 'not-allowed'
                          : 'pointer'
                      }}
                    >
                      {/* Button content with just icons */}
                      <span className="relative z-10 flex items-center gap-1.5">
                        {Array.from(downloads.values()).some((d) => d.status === "connecting") && (
                          <>
                            <div className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                            <span>Connecting</span>
                          </>
                        )}
                        {Array.from(downloads.values()).some((d) => d.status === "downloading") && (
                          <>
                            <Download className="w-3 h-3 animate-pulse" />
                            <span>Downloading</span>
                          </>
                        )}
                        {currentDownload?.status === "completed" && (
                          <>
                            <span className="text-xs">✓</span>
                            <span>Complete</span>
                          </>
                        )}
                        {currentDownload?.status === "error" && (
                          <>
                            <span className="text-xs">❌</span>
                            <span>Retry</span>
                          </>
                        )}
                        {!Array.from(downloads.values()).some((d) => d.status === "connecting" || d.status === "downloading") &&
                         currentDownload?.status !== "completed" &&
                         currentDownload?.status !== "error" && (
                          <>
                            <Download className="w-3 h-3" />
                            <span>Download</span>
                          </>
                        )}
                      </span>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {urlConfig.showFeatures && (
            <div className="mt-8 max-w-2xl mx-auto">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div className="font-mono">
                  <div className="text-xs text-muted-foreground">[FAST]</div>
                  <div className="text-xs text-muted-foreground">performance</div>
                </div>
                <div className="font-mono">
                  <div className="text-xs text-muted-foreground">[GRPC]</div>
                  <div className="text-xs text-muted-foreground">connector</div>
                </div>
                <div className="font-mono">
                  <div className="text-xs text-muted-foreground">[LIVE]</div>
                  <div className="text-xs text-muted-foreground">updates</div>
                </div>
                <div className="font-mono">
                  <div className="text-xs text-muted-foreground">[OPEN]</div>
                  <div className="text-xs text-muted-foreground">source</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="flex-shrink-0">
        <div className="container mx-auto px-6 py-4">
          <div className="flex justify-between items-center text-xs font-mono text-muted-foreground">
            <span>[MIT]</span>
            <div className="flex space-x-4">
              <a href="https://github.com/Justar96/laneharbor" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
                [GITHUB]
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
