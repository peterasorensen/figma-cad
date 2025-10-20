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
    this.manualReconnectTimer = null // Timer for manual reconnection attempts
    this.manualReconnectInterval = 1000 // 1 second for more aggressive reconnection
    this.hasEverConnected = false // Track if we've ever successfully connected
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
      console.log('Connected to server - setting isConnected = true')
      this.isConnected = true
      this.hasEverConnected = true // Mark that we've successfully connected at least once
      this.reconnectAttempts = 0
      console.log('About to clear manual reconnection timer, current timer:', !!this.manualReconnectTimer)

      // Clear manual reconnection timer when successfully connected
      this.clearManualReconnectTimer()

      console.log('After clearing timer, isConnected:', this.isConnected, 'hasTimer:', !!this.manualReconnectTimer)

      // Process any pending canvas join if we have one
      if (this.pendingCanvasJoin) {
        this.processPendingCanvasJoin()
      }
    })

    this.socket.on('disconnect', (reason) => {
      console.log('Disconnected from server:', reason)
      this.isConnected = false
    })

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error)
      this.isConnected = false
      // Notify UI of connection status change
      this.onConnectionStatusChangeCallback?.({ connected: false, error: error.message })
    })

    this.socket.on('error', (error) => {
      console.error('Socket error:', error)
      this.isConnected = false
      // Notify UI of connection status change
      this.onConnectionStatusChangeCallback?.({ connected: false, error: error.message })
    })

    this.socket.on('reconnect', (attemptNumber) => {
      console.log(`Reconnected after ${attemptNumber} attempts`)
      this.reconnectAttempts = attemptNumber
      this.isConnected = true
      // Notify UI of successful reconnection
      this.onConnectionStatusChangeCallback?.({ connected: true })
    })

    this.socket.on('reconnect_failed', () => {
      console.error('Failed to reconnect to server')
      this.isConnected = false
      // Notify UI of reconnection failure
      this.onConnectionStatusChangeCallback?.({ connected: false, error: 'Reconnection failed' })

      // Start manual reconnection attempts
      this.startManualReconnectTimer()
    })

    // Handle connection state changes more comprehensively
    this.socket.on('connecting', () => {
      console.log('Socket connecting...')
      this.isConnected = false
      this.onConnectionStatusChangeCallback?.({ connected: false, connecting: true })
    })

    this.socket.on('disconnect', (reason) => {
      console.log('Disconnected from server:', reason, 'isConnected was:', this.isConnected)
      this.isConnected = false
      // Clear online users when disconnected
      if (this.onDisconnectCallback) {
        this.onDisconnectCallback(reason)
      }
      this.onConnectionStatusChangeCallback?.({ connected: false, reason })

      // Start manual reconnection timer for aggressive reconnection
      this.startManualReconnectTimer()
      console.log('Manual reconnection timer started after disconnect')
    })

    // Canvas events
    this.socket.on('canvas-state', (data) => {
      console.log('📨 Socket received canvas-state:', data)
      this.onCanvasStateCallback?.(data)
    })

    this.socket.on('user-joined', (data) => {
      this.onUserJoinedCallback?.(data)
    })

    this.socket.on('user-left', (data) => {
      this.onUserLeftCallback?.(data)
    })

    this.socket.on('cursor-update', (data) => {
      this.onCursorUpdateCallback?.(data)
    })

    // Object events
    this.socket.on('object-created', (data) => {
      this.onObjectCreatedCallback?.(data)
    })

    this.socket.on('object-updated', (data) => {
      this.onObjectUpdatedCallback?.(data)
    })

    this.socket.on('object-deleted', (data) => {
      this.onObjectDeletedCallback?.(data)

      this.socket.on('boolean-operation', (data) => {
        this.onBooleanOperationCallback?.(data)
      })
    })

    // Error handling
    this.socket.on('error', (error) => {
      console.error('Socket error:', error)
      this.onErrorCallback?.(error)
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
    this.clearManualReconnectTimer()
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
    this.onCanvasStateCallback = callback
  }

  onUserJoined(callback) {
    this.onUserJoinedCallback = callback
  }

  onUserLeft(callback) {
    this.onUserLeftCallback = callback
  }

  onCursorUpdate(callback) {
    this.onCursorUpdateCallback = callback
  }

  onObjectCreated(callback) {
    this.onObjectCreatedCallback = callback
  }

  onObjectUpdated(callback) {
    this.onObjectUpdatedCallback = callback
  }

  onObjectDeleted(callback) {
    this.onObjectDeletedCallback = callback
  }

  onBooleanOperation(callback) {
    this.onBooleanOperationCallback = callback
  }

  onError(callback) {
    this.onErrorCallback = callback
  }

  onDisconnect(callback) {
    this.onDisconnectCallback = callback
  }

  onConnectionStatusChange(callback) {
    this.onConnectionStatusChangeCallback = callback
  }

  /**
   * Start manual reconnection timer for continuous reconnection attempts
   */
  startManualReconnectTimer() {
    if (this.manualReconnectTimer) return // Already running

    console.log(`Starting manual reconnection timer (${this.manualReconnectInterval}ms interval)`)

    this.manualReconnectTimer = setInterval(() => {
      if (this.socket) {
        console.log('Manual reconnection check - connected:', this.socket.connected, 'connecting:', this.socket.connecting)

        if (!this.socket.connected) {
          console.log('Attempting manual reconnection...')
          try {
            // Always disconnect first to ensure clean state
            this.socket.disconnect()

            // Small delay before reconnecting to avoid race conditions
            setTimeout(() => {
              if (this.socket && !this.socket.connected) {
                console.log('Executing manual reconnect...')
                this.socket.connect()
              }
            }, 100)
          } catch (error) {
            console.error('Error during manual reconnection:', error)
          }
        }
      } else {
        console.log('No socket available for manual reconnection')
      }
    }, this.manualReconnectInterval)
  }

  /**
   * Clear the manual reconnection timer
   */
  clearManualReconnectTimer() {
    if (this.manualReconnectTimer) {
      console.log('Clearing manual reconnection timer')
      clearInterval(this.manualReconnectTimer)
      this.manualReconnectTimer = null
      console.log('Manual reconnection timer cleared, isConnected:', this.isConnected)
    } else {
      console.log('Manual reconnection timer was already null')
    }
  }
}

// Export singleton instance
export const socketManager = new SocketManager()

