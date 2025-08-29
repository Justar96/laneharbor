import { WebSocketServer, WebSocket } from 'ws'
import { Server as HTTPServer } from 'node:http'
import { EventEmitter } from 'node:events'
import { StorageClient } from '../clients/storage.client.js'

interface Client {
  id: string
  ws: WebSocket
  subscriptions: Set<string> // operation IDs being tracked
}

export class WebSocketService extends EventEmitter {
  private wss: WebSocketServer
  private clients: Map<string, Client> = new Map()
  private storageClient: StorageClient
  private progressSubscriptions: Map<string, EventEmitter> = new Map()

  constructor(server: HTTPServer, storageClient: StorageClient) {
    super()
    this.storageClient = storageClient
    
    // Create WebSocket server attached to HTTP server
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws'
    })

    this.setupWebSocketServer()
  }

  private setupWebSocketServer() {
    this.wss.on('connection', (ws: WebSocket, request) => {
      const clientId = this.generateClientId()
      console.log(`WebSocket client connected: ${clientId}`)

      // Create client record
      const client: Client = {
        id: clientId,
        ws,
        subscriptions: new Set(),
      }
      this.clients.set(clientId, client)

      // Send welcome message
      this.sendToClient(client, {
        type: 'connection',
        clientId,
        message: 'Connected to LaneHarbor WebSocket service',
      })

      // Handle client messages
      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString())
          this.handleClientMessage(client, message)
        } catch (error) {
          console.error('Invalid WebSocket message:', error)
          this.sendToClient(client, {
            type: 'error',
            message: 'Invalid message format',
          })
        }
      })

      // Handle ping/pong for connection health
      ws.on('pong', () => {
        // Connection is alive
      })

      // Handle client disconnect
      ws.on('close', () => {
        console.log(`WebSocket client disconnected: ${clientId}`)
        this.handleClientDisconnect(client)
      })

      ws.on('error', (error) => {
        console.error(`WebSocket error for client ${clientId}:`, error)
      })
    })

    // Periodic ping to keep connections alive
    setInterval(() => {
      this.clients.forEach((client) => {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.ping()
        }
      })
    }, 30000) // Every 30 seconds
  }

  private handleClientMessage(client: Client, message: any) {
    switch (message.type) {
      case 'subscribe-upload':
        this.subscribeToUploadProgress(client, message.operationId)
        break
      
      case 'subscribe-download':
        this.subscribeToDownloadProgress(client, message.operationId)
        break
      
      case 'unsubscribe':
        this.unsubscribeFromProgress(client, message.operationId)
        break
      
      case 'ping':
        this.sendToClient(client, { type: 'pong' })
        break
      
      default:
        this.sendToClient(client, {
          type: 'error',
          message: `Unknown message type: ${message.type}`,
        })
    }
  }

  private subscribeToUploadProgress(client: Client, operationId: string) {
    // Check if already subscribed
    if (client.subscriptions.has(operationId)) {
      return
    }

    // Check if we already have a subscription to this operation
    let progressEmitter = this.progressSubscriptions.get(operationId)
    
    if (!progressEmitter) {
      // Create new subscription to storage service
      progressEmitter = this.storageClient.subscribeToUploadProgress(operationId)
      this.progressSubscriptions.set(operationId, progressEmitter)

      // Clean up when done
      progressEmitter.once('end', () => {
        this.progressSubscriptions.delete(operationId)
      })
    }

    // Add client subscription
    client.subscriptions.add(operationId)

    // Forward progress updates to client
    const progressHandler = (progress: any) => {
      this.sendToClient(client, {
        type: 'upload-progress',
        operationId,
        ...progress,
      })
    }

    progressEmitter.on('progress', progressHandler)

    // Clean up on unsubscribe
    progressEmitter.once('end', () => {
      progressEmitter?.removeListener('progress', progressHandler)
      client.subscriptions.delete(operationId)
    })

    // Confirm subscription
    this.sendToClient(client, {
      type: 'subscribed',
      operationId,
      operation: 'upload',
    })
  }

  private subscribeToDownloadProgress(client: Client, operationId: string) {
    // Check if already subscribed
    if (client.subscriptions.has(operationId)) {
      return
    }

    // Check if we already have a subscription to this operation
    let progressEmitter = this.progressSubscriptions.get(operationId)
    
    if (!progressEmitter) {
      // Create new subscription to storage service
      progressEmitter = this.storageClient.subscribeToDownloadProgress(operationId)
      this.progressSubscriptions.set(operationId, progressEmitter)

      // Clean up when done
      progressEmitter.once('end', () => {
        this.progressSubscriptions.delete(operationId)
      })
    }

    // Add client subscription
    client.subscriptions.add(operationId)

    // Forward progress updates to client
    const progressHandler = (progress: any) => {
      this.sendToClient(client, {
        type: 'download-progress',
        operationId,
        ...progress,
      })
    }

    progressEmitter.on('progress', progressHandler)

    // Clean up on unsubscribe
    progressEmitter.once('end', () => {
      progressEmitter?.removeListener('progress', progressHandler)
      client.subscriptions.delete(operationId)
    })

    // Confirm subscription
    this.sendToClient(client, {
      type: 'subscribed',
      operationId,
      operation: 'download',
    })
  }

  private unsubscribeFromProgress(client: Client, operationId: string) {
    client.subscriptions.delete(operationId)
    
    // Check if any other clients are subscribed
    let hasOtherSubscribers = false
    this.clients.forEach((c) => {
      if (c.id !== client.id && c.subscriptions.has(operationId)) {
        hasOtherSubscribers = true
      }
    })

    // If no other subscribers, clean up the storage service subscription
    if (!hasOtherSubscribers) {
      const emitter = this.progressSubscriptions.get(operationId)
      if (emitter) {
        emitter.removeAllListeners()
        this.progressSubscriptions.delete(operationId)
      }
    }

    // Confirm unsubscribe
    this.sendToClient(client, {
      type: 'unsubscribed',
      operationId,
    })
  }

  private handleClientDisconnect(client: Client) {
    // Clean up subscriptions
    client.subscriptions.forEach((operationId) => {
      this.unsubscribeFromProgress(client, operationId)
    })

    // Remove client
    this.clients.delete(client.id)
  }

  private sendToClient(client: Client, data: any) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(data))
    }
  }

  // Broadcast to all connected clients
  broadcast(data: any) {
    const message = JSON.stringify(data)
    this.clients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message)
      }
    })
  }

  // Send notification to specific clients
  sendNotification(clientIds: string[], notification: any) {
    const message = JSON.stringify({
      type: 'notification',
      ...notification,
    })

    clientIds.forEach((clientId) => {
      const client = this.clients.get(clientId)
      if (client && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message)
      }
    })
  }

  // Send progress update directly (without storage service)
  sendProgressUpdate(operationId: string, progress: any) {
    const message = {
      type: 'progress-update',
      operationId,
      ...progress,
    }

    this.clients.forEach((client) => {
      if (client.subscriptions.has(operationId)) {
        this.sendToClient(client, message)
      }
    })
  }

  private generateClientId(): string {
    return `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  // Get connected clients count
  getClientsCount(): number {
    return this.clients.size
  }

  // Get active subscriptions count
  getSubscriptionsCount(): number {
    return this.progressSubscriptions.size
  }

  // Graceful shutdown
  shutdown() {
    // Close all WebSocket connections
    this.clients.forEach((client) => {
      client.ws.close(1000, 'Server shutting down')
    })

    // Clean up subscriptions
    this.progressSubscriptions.forEach((emitter) => {
      emitter.removeAllListeners()
    })
    this.progressSubscriptions.clear()

    // Close WebSocket server
    this.wss.close()
  }
}
