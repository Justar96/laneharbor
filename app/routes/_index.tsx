import type { MetaFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { useState } from "react";
import React from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Progress } from "~/components/ui/progress";
import { Typewriter } from "~/components/ui/typewriter";
import { Server, Download, Github, Package } from 'lucide-react';

export const meta: MetaFunction = () => {
  return [
    { title: "LaneHarbor - App Distribution Platform" },
    { name: "description", content: "Modern app distribution and release management" },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  
  try {
    const response = await fetch(`${baseUrl}/v1/apps`);
    const data = await response.json();
    return json({ apps: data.apps || [], baseUrl, error: null });
  } catch (error) {
    return json({ apps: [], baseUrl, error: "Failed to fetch apps" });
  }
}

export default function Index() {
  const { apps, baseUrl, error } = useLoaderData<typeof loader>();
  const [selectedApp, setSelectedApp] = useState<string>("");
  const [releases, setReleases] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);

  const fetchReleases = async (appName: string) => {
    setLoading(true);
    try {
      const response = await fetch(`${baseUrl}/v1/apps/${appName}/releases`);
      const data = await response.json();
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

  const simulateDownload = (downloadUrl: string) => {
    setIsDownloading(true);
    setDownloadProgress(0);

    const interval = setInterval(() => {
      setDownloadProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsDownloading(false);
          // Trigger actual download
          window.open(downloadUrl, '_blank');
          return 100;
        }
        return prev + Math.random() * 15;
      });
    }, 200);
  };

  return (
    <div className="h-screen overflow-hidden bg-background flex flex-col">
      {/* Header */}
      <header className="flex-shrink-0">
        <div className="container mx-auto px-6">
          <div className="flex h-14 items-center justify-between">
            <div className="flex items-center space-x-3">
              <Server className="h-5 w-5 text-foreground" />
              <span className="text-lg font-medium text-foreground">LaneHarbor</span>
              <Badge variant="outline" className="text-xs font-mono">
                v2.1.0
              </Badge>
            </div>

            <div className="flex items-center space-x-4">
              <Link to="/ui" className="text-sm text-muted-foreground hover:text-foreground">
                Legacy UI
              </Link>
              <Button variant="ghost" size="sm">
                <Github className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center">
        <div className="container mx-auto px-6 max-w-4xl">
          {/* Hero Section */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-medium text-foreground mb-3">
              <span>Minimal server for </span>
              <Typewriter
                text={["app downloads", "update feeds", "file serving", "JSON APIs"]}
                speed={80}
                className="text-foreground"
                waitTime={2000}
                deleteSpeed={50}
                cursorChar="_"
                cursorClassName="ml-0"
              />
            </h1>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Built with Bun + Hono. Serves downloads and JSON update feeds with minimal configuration.
            </p>
          </div>

          {/* App Selection */}
          {apps.length > 0 && (
            <div className="max-w-md mx-auto mb-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center">
                    <Package className="h-4 w-4 mr-2" />
                    Select Application
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <select
                    value={selectedApp}
                    onChange={(e) => handleAppSelect(e.target.value)}
                    className="w-full p-2 border border-input bg-background rounded-md text-sm"
                  >
                    <option value="">Choose an app...</option>
                    {apps.map((app) => (
                      <option key={app} value={app}>
                        {app}
                      </option>
                    ))}
                  </select>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Download Demo or Releases */}
          <div className="max-w-md mx-auto">
            {selectedApp && releases.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center">
                    <Download className="h-4 w-4 mr-2" />
                    Latest Release - {selectedApp}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {releases[0] && (
                      <>
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-mono">v{releases[0].version}</span>
                          <span className="text-muted-foreground">
                            {new Date(releases[0].pub_date).toLocaleDateString()}
                          </span>
                        </div>
                        <Progress value={downloadProgress} className="h-2" />
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">
                            {isDownloading
                              ? `${Math.round(downloadProgress)}%`
                              : downloadProgress === 100
                                ? "Complete"
                                : "Ready"}
                          </span>
                          <div className="flex gap-2">
                            {releases[0].assets.map((asset: any) => (
                              <Button
                                key={asset.platform}
                                size="sm"
                                onClick={() => simulateDownload(`${baseUrl}/v1/apps/${selectedApp}/releases/${releases[0].version}/download?platform=${encodeURIComponent(asset.platform)}`)}
                                disabled={isDownloading}
                                className="h-7 text-xs"
                              >
                                {asset.platform}
                              </Button>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center">
                    <Download className="h-4 w-4 mr-2" />
                    Download Demo
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-mono">demo-app.zip</span>
                      <span className="text-muted-foreground">2.4 MB</span>
                    </div>
                    <Progress value={downloadProgress} className="h-2" />
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {isDownloading
                          ? `${Math.round(downloadProgress)}%`
                          : downloadProgress === 100
                            ? "Complete"
                            : "Ready"}
                      </span>
                      <Button 
                        size="sm" 
                        onClick={() => simulateDownload('#')} 
                        disabled={isDownloading} 
                        className="h-7"
                      >
                        {isDownloading ? "Downloading..." : "Start"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Features */}
          <div className="mt-8 max-w-2xl mx-auto">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-sm font-medium">Fast</div>
                <div className="text-xs text-muted-foreground">Bun runtime</div>
              </div>
              <div>
                <div className="text-sm font-medium">Simple</div>
                <div className="text-xs text-muted-foreground">Zero config</div>
              </div>
              <div>
                <div className="text-sm font-medium">Updates</div>
                <div className="text-xs text-muted-foreground">JSON feeds</div>
              </div>
              <div>
                <div className="text-sm font-medium">Open</div>
                <div className="text-xs text-muted-foreground">MIT license</div>
              </div>
            </div>
          </div>

          {/* All Releases */}
          {selectedApp && releases.length > 1 && (
            <div className="mt-8 max-w-4xl mx-auto">
              <h2 className="text-lg font-medium mb-4 text-center">All Releases</h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {releases.slice(1).map((release) => (
                  <Card key={release.version} className="text-sm">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <span className="font-mono">v{release.version}</span>
                        <Badge variant="outline" className="text-xs">
                          {release.channel}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <p className="text-xs text-muted-foreground mb-3">
                        {new Date(release.pub_date).toLocaleDateString()}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {release.assets.map((asset: any) => (
                          <Button
                            key={asset.platform}
                            variant="outline"
                            size="sm"
                            className="h-6 text-xs px-2"
                            onClick={() => window.open(`${baseUrl}/v1/apps/${selectedApp}/releases/${release.version}/download?platform=${encodeURIComponent(asset.platform)}`, '_blank')}
                          >
                            {asset.platform}
                          </Button>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="mt-6 max-w-md mx-auto">
              <Card className="border-destructive">
                <CardContent className="pt-6">
                  <p className="text-destructive text-sm text-center">{error}</p>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="flex-shrink-0">
        <div className="container mx-auto px-6 py-4">
          <div className="flex justify-between items-center text-xs text-muted-foreground">
            <span>MIT License</span>
            <div className="flex space-x-4">
              <a href="#" className="hover:text-foreground">
                GitHub
              </a>
              <a href="#" className="hover:text-foreground">
                Docs
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
