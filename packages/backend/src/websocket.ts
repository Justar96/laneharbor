import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'node:http'
import type { StorageClient } from './clients/storage.client.js'
import type { UploadProgress, DownloadProgress } from './types.js'

interface WSClient {
  id: string
  ws: WebSocket
  subscriptions: Set<string> // Set of sessionIds
  isAlive: boolean
}

export class WebSocketService {
  private wss: WebSocketServer
  private clients: Map<string, WSClient>
  private heartbeatInterval: NodeJS.Timeout | null
  private storageClient: StorageClient

  constructor(server: Server, storageClient: StorageClient) {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws'
    })
    
    this.clients = new Map()
    this.storageClient = storageClient
    this.heartbeatInterval = null
    
    this.initialize()
  }

  private initialize() {
    // Setup WebSocket server event handlers
    this.wss.on('connection', (ws: WebSocket, req) => {
      const clientId = this.generateClientId()
      const client: WSClient = {
        id: clientId,
        ws,
        subscriptions: new Set(),
        isAlive: true
      }
      
      this.clients.set(clientId, client)
      console.log(`WebSocket client connected: ${clientId}`)
      
      // Send welcome message
      this.sendToClient(client, {
        type: 'connected',
        clientId,
        timestamp: new Date().toISOString()
      })
      
      // Setup client event handlers
      ws.on('message', (data) => this.handleMessage(client, data))
      ws.on('pong', () => this.handlePong(client))
      ws.on('close', () => this.handleDisconnect(client))
      ws.on('error', (error) => this.handleError(client, error))
    })
    
    // Start heartbeat mechanism
    this.startHeartbeat()
  }

  private handleMessage(client: WSClient, data: any) {
    try {
      const message = JSON.parse(data.toString())
      
      switch (message.type) {
        case 'subscribe':
          this.handleSubscribe(client, message.sessionId)
          break
          
        case 'unsubscribe':
          this.handleUnsubscribe(client, message.sessionId)
          break
          
        case 'ping':
          this.sendToClient(client, { type: 'pong', timestamp: Date.now() })
          break
          
        default:
          console.warn(`Unknown message type from client ${client.id}: ${message.type}`)
      }
    } catch (error) {
      console.error(`Error handling message from client ${client.id}:`, error)
      this.sendError(client, 'Invalid message format')
    }
  }

  private async handleSubscribe(client: WSClient, sessionId: string) {
    if (!sessionId) {
      this.sendError(client, 'Session ID required for subscription')
      return
    }
    
    // Add to client's subscriptions
    client.subscriptions.add(sessionId)
    
    // Subscribe to storage service progress stream
    try {
      const progressStream = await this.storageClient.subscribeToUploadProgress(sessionId)
      
      progressStream.on('data', (progress: UploadProgress | DownloadProgress) => {
        // Forward progress to subscribed client
        if (client.subscriptions.has(sessionId) && client.ws.readyState === WebSocket.OPEN) {
          this.sendToClient(client, {
            type: 'progress',
            sessionId,
            progress: {
              percent: progress.percent,
              transferred: progress.transferred,
              total: progress.total,
              speed: progress.speed
            },
            timestamp: new Date().toISOString()
          })
        }
      })
      
      progressStream.on('end', () => {
        // Notify client that operation completed
        if (client.subscriptions.has(sessionId) && client.ws.readyState === WebSocket.OPEN) {
          this.sendToClient(client, {
            type: 'complete',
            sessionId,
            timestamp: new Date().toISOString()
          })
          client.subscriptions.delete(sessionId)
        }
      })
      
      progressStream.on('error', (error: Error) => {
        console.error(`Progress stream error for session ${sessionId}:`, error)
        if (client.subscriptions.has(sessionId) && client.ws.readyState === WebSocket.OPEN) {
          this.sendToClient(client, {
            type: 'error',
            sessionId,
            error: error.message,
            timestamp: new Date().toISOString()
          })
          client.subscriptions.delete(sessionId)
        }
      })
      
      // Confirm subscription
      this.sendToClient(client, {
        type: 'subscribed',
        sessionId,
        timestamp: new Date().toISOString()
      })
      
    } catch (error) {
      console.error(`Failed to subscribe to session ${sessionId}:`, error)
      this.sendError(client, `Failed to subscribe to session: ${error}`)
    }
  }

  private handleUnsubscribe(client: WSClient, sessionId: string) {
    if (client.subscriptions.has(sessionId)) {
      client.subscriptions.delete(sessionId)
      this.sendToClient(client, {
        type: 'unsubscribed',
        sessionId,
        timestamp: new Date().toISOString()
      })
    }
  }

  private handlePong(client: WSClient) {
    client.isAlive = true
  }

  private handleDisconnect(client: WSClient) {
    console.log(`WebSocket client disconnected: ${client.id}`)
    this.clients.delete(client.id)
  }

  private handleError(client: WSClient, error: Error) {
    console.error(`WebSocket error for client ${client.id}:`, error)
  }

  private sendToClient(client: WSClient, data: any) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(data))
    }
  }

  private sendError(client: WSClient, message: string) {
    this.sendToClient(client, {
      type: 'error',
      error: message,
      timestamp: new Date().toISOString()
    })
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.clients.forEach((client) => {
        if (!client.isAlive) {
          // Client didn't respond to last ping, terminate connection
          console.log(`Terminating inactive client: ${client.id}`)
          client.ws.terminate()
          this.clients.delete(client.id)
          return
        }
        
        // Mark as not alive and send ping
        client.isAlive = false
        client.ws.ping()
      })
    }, 30000) // Ping every 30 seconds
  }

  private generateClientId(): string {
    return `ws-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  // Broadcast to all connected clients
  public broadcast(data: any) {
    const message = JSON.stringify({
      ...data,
      timestamp: new Date().toISOString()
    })
    
    this.clients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message)
      }
    })
  }

  // Send notification to clients subscribed to a specific session
  public notifySession(sessionId: string, data: any) {
    this.clients.forEach((client) => {
      if (client.subscriptions.has(sessionId) && client.ws.readyState === WebSocket.OPEN) {
        this.sendToClient(client, {
          ...data,
          sessionId,
          timestamp: new Date().toISOString()
        })
      }
    })
  }

  // Graceful shutdown
  public shutdown() {
    console.log('Shutting down WebSocket service...')
    
    // Stop heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
    
    // Close all client connections
    this.clients.forEach((client) => {
      client.ws.close(1000, 'Server shutting down')
    })
    this.clients.clear()
    
    // Close WebSocket server
    this.wss.close()
  }
}
