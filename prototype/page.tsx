"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Typewriter } from "@/components/ui/typewriter"
import { Server, Download, Github } from 'lucide-react'
import { useState } from "react"

export default function LaneHarborPage() {
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [isDownloading, setIsDownloading] = useState(false)

  const simulateDownload = () => {
    setIsDownloading(true)
    setDownloadProgress(0)

    const interval = setInterval(() => {
      setDownloadProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval)
          setIsDownloading(false)
          return 100
        }
        return prev + Math.random() * 15
      })
    }, 200)
  }

  return (
    <div className="h-screen overflow-hidden bg-background flex flex-col">
      {/* <CHANGE> Simplified header without borders */}
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
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground">
                Documentation
              </a>
              <Button variant="ghost" size="sm">
                <Github className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center">
        <div className="container mx-auto px-6 max-w-4xl">
          {/* <CHANGE> Updated hero title with typewriter for server-focused messaging */}
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

          <div className="max-w-md mx-auto">
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
                    <Button size="sm" onClick={simulateDownload} disabled={isDownloading} className="h-7">
                      {isDownloading ? "Downloading..." : "Start"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

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
        </div>
      </main>

      {/* <CHANGE> Simplified footer without borders */}
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
  )
}
