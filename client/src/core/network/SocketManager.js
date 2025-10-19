import { io } from 'socket.io-client'
import { auth } from '../auth/Auth.js'

export class SocketManager {
  constructor() {
    this.socket = null
    this.currentCanvasId = null
    this.isConnected = false
    this.isAuthenticated = false
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 5
    this.pendingCanvasJoin = null // Queue for canvas join requests
    this.authCheckInterval = null
  }

  connect() {
    if (this.socket?.connected) return

    const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

    this.socket = io(serverUrl, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000
    })

    this.socket.on('connect', () => {
      console.log('Connected to server')
      this.isConnected = true
      this.reconnectAttempts = 0

      // Process any pending canvas join if we have one
      if (this.pendingCanvasJoin) {
        this.processPendingCanvasJoin()
      }
    })

    this.socket.on('disconnect', (reason) => {
      console.log('Disconnected from server:', reason)
      this.isConnected = false
    })

    this.socket.on('reconnect', (attemptNumber) => {
      console.log(`Reconnected after ${attemptNumber} attempts`)
      this.reconnectAttempts = attemptNumber
    })

    this.socket.on('reconnect_failed', () => {
      console.error('Failed to reconnect to server')
      this.isConnected = false
    })

    // Canvas events
    this.socket.on('canvas-state', (data) => {
      console.log('📨 Socket received canvas-state:', data)
      this.onCanvasState?.(data)
    })

    this.socket.on('user-joined', (data) => {
      this.onUserJoined?.(data)
    })

    this.socket.on('user-left', (data) => {
      this.onUserLeft?.(data)
    })

    this.socket.on('cursor-update', (data) => {
      this.onCursorUpdate?.(data)
    })

    // Object events
    this.socket.on('object-created', (data) => {
      this.onObjectCreated?.(data)
    })

    this.socket.on('object-updated', (data) => {
      this.onObjectUpdated?.(data)
    })

    this.socket.on('object-deleted', (data) => {
      this.onObjectDeleted?.(data)
    })

    // Error handling
    this.socket.on('error', (error) => {
      console.error('Socket error:', error)
      this.onError?.(error)
    })

    this.socket.connect()
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
      this.isConnected = false
    }

    // Clean up pending operations
    this.pendingCanvasJoin = null
    this.stopAuthCheck()
  }

  joinCanvas(canvasId) {
    console.log(`🔄 joinCanvas called for: ${canvasId}`)
    console.log(`Connection status: ${this.socket?.connected ? 'connected' : 'not connected'}`)
    console.log(`Auth status: ${auth.isAuthenticated ? 'authenticated' : 'not authenticated'}`)

    // Check if we're ready to join (both connected and authenticated)
    if (this.socket?.connected && auth.isAuthenticated) {
      this.currentCanvasId = canvasId
      this.socket.emit('join-canvas', {
        canvasId,
        userId: auth.userId
      })
      console.log(`✅ Joined canvas: ${canvasId}`)
    } else {
      // Queue the join request for later
      this.pendingCanvasJoin = canvasId
      console.log(`📋 Queued canvas join for: ${canvasId}`)

      // If not authenticated, start checking for authentication
      if (!auth.isAuthenticated) {
        console.log('🔄 Starting auth check...')
        this.startAuthCheck()
      }

      // If not connected, the connection handler will process the queue when connected
      if (!this.socket?.connected) {
        console.log('🔄 Waiting for socket connection...')
      }
    }
  }

  startAuthCheck() {
    if (this.authCheckInterval) return

    this.authCheckInterval = setInterval(() => {
      if (auth.isAuthenticated && this.socket?.connected) {
        this.stopAuthCheck()
        this.processPendingCanvasJoin()
      }
    }, 100) // Check every 100ms
  }

  stopAuthCheck() {
    if (this.authCheckInterval) {
      clearInterval(this.authCheckInterval)
      this.authCheckInterval = null
    }
  }

  processPendingCanvasJoin() {
    console.log(`🔄 processPendingCanvasJoin called`)
    console.log(`Pending: ${this.pendingCanvasJoin}`)
    console.log(`Connected: ${this.socket?.connected}`)
    console.log(`Authenticated: ${auth.isAuthenticated}`)

    if (this.pendingCanvasJoin && this.socket?.connected && auth.isAuthenticated) {
      const canvasId = this.pendingCanvasJoin
      this.pendingCanvasJoin = null

      this.currentCanvasId = canvasId
      this.socket.emit('join-canvas', {
        canvasId,
        userId: auth.userId
      })
      console.log(`✅ Processed pending canvas join: ${canvasId}`)
    } else {
      console.log(`❌ Cannot process pending join - missing requirements`)
    }
  }

  leaveCanvas() {
    if (this.currentCanvasId && this.socket?.connected) {
      this.socket.emit('leave-canvas')
    }
    this.currentCanvasId = null
  }

  // Object manipulation methods
  createObject(objectData) {
    if (this.socket?.connected) {
      this.socket.emit('create-object', objectData)
    }
  }

  updateObject(objectId, updateData) {
    if (this.socket?.connected) {
      this.socket.emit('update-object', { id: objectId, ...updateData })
    }
  }

  deleteObject(objectId) {
    if (this.socket?.connected) {
      this.socket.emit('delete-object', { id: objectId })
    }
  }

  // Cursor methods
  updateCursor(position) {
    if (this.socket?.connected) {
      this.socket.emit('cursor-update', position)
    }
  }

  // Event callbacks
  onCanvasState(callback) {
    this.onCanvasState = callback
  }

  onUserJoined(callback) {
    this.onUserJoined = callback
  }

  onUserLeft(callback) {
    this.onUserLeft = callback
  }

  onCursorUpdate(callback) {
    this.onCursorUpdate = callback
  }

  onObjectCreated(callback) {
    this.onObjectCreated = callback
  }

  onObjectUpdated(callback) {
    this.onObjectUpdated = callback
  }

  onObjectDeleted(callback) {
    this.onObjectDeleted = callback
  }

  onError(callback) {
    this.onError = callback
  }
}

// Export singleton instance
export const socketManager = new SocketManager()

