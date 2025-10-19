import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import path from 'path'

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), 'server', '.env') })

const app = express()
const server = createServer(app)
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling']
})

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Middleware
app.use(cors())
app.use(express.json())

// Store connected users and their canvas sessions
const userSessions = new Map() // userId -> { socketId, canvasId, cursor }
const canvasRooms = new Map() // canvasId -> Set of socketIds
let connectionCount = 0
const MAX_CONNECTIONS = 100

// Socket.io connection handling
io.on('connection', (socket) => {
  connectionCount++

  if (connectionCount > MAX_CONNECTIONS) {
    console.log(`Connection rejected: too many connections (${connectionCount}/${MAX_CONNECTIONS})`)
    socket.disconnect()
    return
  }

  console.log(`User connected: ${socket.id} (connections: ${connectionCount}/${MAX_CONNECTIONS})`)

  // Log connection details for debugging (limit logging)
  if (Math.random() < 0.1) { // Only log 10% of connections to avoid spam
    console.log('Connection details:', {
      id: socket.id,
      handshake: socket.handshake.headers,
      connected: socket.connected
    })
  }

  // Handle user joining a canvas
  socket.on('join-canvas', async (data) => {
    try {
      const { canvasId, userId } = data
      console.log(`User ${userId} attempting to join canvas ${canvasId}`)

      // Leave previous canvas room if any
      if (userSessions.has(socket.id)) {
        const prevSession = userSessions.get(socket.id)
        socket.leave(`canvas:${prevSession.canvasId}`)
        canvasRooms.get(prevSession.canvasId)?.delete(socket.id)
      }

      // Join new canvas room
      socket.join(`canvas:${canvasId}`)

      // Store user session
      userSessions.set(socket.id, {
        userId,
        canvasId,
        cursor: { x: 0, y: 0, z: 0 }
      })

      // Add to canvas room
      if (!canvasRooms.has(canvasId)) {
        canvasRooms.set(canvasId, new Set())
      }
      canvasRooms.get(canvasId).add(socket.id)

      // Validate that canvas exists before proceeding
      const { data: canvasCheck, error: canvasError } = await supabase
        .from('canvases')
        .select('id')
        .eq('id', canvasId)
        .single()

      if (canvasError || !canvasCheck) {
        console.log(`❌ Canvas ${canvasId} does not exist, rejecting join`)
        socket.emit('error', { message: 'Canvas not found' })
        return
      }

      console.log(`📊 Canvas ${canvasId} exists:`, !!canvasCheck)

      // Load canvas state
      const { data: objects } = await supabase
        .from('objects')
        .select('*')
        .eq('canvas_id', canvasId)

      // Get user's email for storing in session
      const { data: userData } = await supabase.auth.admin.getUserById(userId)
      const userEmail = userData?.user?.email || null

      // Update/create session for current user (upsert handles existing sessions)
      console.log(`📝 Upserting session for user ${userId} on canvas ${canvasId}`)
      const { data: sessionData, error: sessionError } = await supabase
        .from('user_sessions')
        .upsert({
          user_id: userId,
          canvas_id: canvasId,
          user_email: userEmail,
          cursor_x: 0,
          cursor_y: 0,
          cursor_z: 0,
          last_seen: new Date().toISOString()
        }, {
          onConflict: 'user_id,canvas_id'
        })
        .select()
        .single()

      console.log(`📝 Session upsert result:`, { sessionData, sessionError })

      if (sessionError) {
        console.error(`📝 Failed to upsert session:`, sessionError)
      }

      // Small delay to ensure the upsert is committed
      await new Promise(resolve => setTimeout(resolve, 100))

      // Load all user sessions for presence (including current user)
      // Load all sessions for the canvas to ensure proper sync
      console.log(`📊 Attempting to load sessions for canvas ID: ${canvasId} (type: ${typeof canvasId})`)

      const { data: sessions, error: sessionsError } = await supabase
        .from('user_sessions')
        .select('*')
        .eq('canvas_id', canvasId)

      console.log(`📊 Loading sessions for canvas ${canvasId}:`, {
        sessionsFound: sessions?.length || 0,
        sessionsError,
        sessions: sessions?.map(s => ({ userId: s.user_id, lastSeen: s.last_seen })),
        canvasIdType: typeof canvasId,
        canvasIdValue: canvasId
      })

      // Send current state to user (includes all sessions)
      socket.emit('canvas-state', {
        objects: objects || [],
        sessions: sessions || []
      })

      // Use the email we already fetched for the session (reuse the userEmail variable)
      const displayEmail = userEmail || `User ${userId.substring(0, 8)}`

      // Notify others about new user (don't send to current user since their cursor is already in canvas state)
      socket.to(`canvas:${canvasId}`).emit('user-joined', {
        userId,
        userEmail: displayEmail,
        canvasId
      })

      console.log(`✅ User ${userId} successfully joined canvas ${canvasId}`)
    } catch (error) {
      console.error('Error joining canvas:', error)
      socket.emit('error', { message: 'Failed to join canvas' })
    }
  })

  // Handle cursor position updates
  socket.on('cursor-update', (data) => {
    const session = userSessions.get(socket.id)
    if (session) {
      session.cursor = data

      // Update database (throttled)
      updateUserSession(session.userId, session.canvasId, data)

      // Broadcast to other users in same canvas
      socket.to(`canvas:${session.canvasId}`).emit('cursor-update', {
        userId: session.userId,
        ...data
      })
    }
  })

  // Handle object creation
  socket.on('create-object', async (data) => {
    const session = userSessions.get(socket.id)
    if (!session) return

    try {
      const objectData = {
        ...data,
        canvas_id: session.canvasId,
        created_by: session.userId
      }

      const { data: newObject, error } = await supabase
        .from('objects')
        .insert(objectData)
        .select()
        .single()

      if (error) throw error

      // Broadcast to other users in canvas (don't send back to creator to avoid duplicates)
      socket.to(`canvas:${session.canvasId}`).emit('object-created', newObject)

      console.log(`Object created in canvas ${session.canvasId}`)
    } catch (error) {
      console.error('Error creating object:', error)
      socket.emit('error', { message: 'Failed to create object' })
    }
  })

  // Handle object updates
  socket.on('update-object', async (data) => {
    const session = userSessions.get(socket.id)
    if (!session) return

    try {
      const { id, ...updateData } = data

      // Throttle object updates to reduce database load
      const updateKey = `${id}-${session.canvasId}`

      if (objectUpdates.has(updateKey)) {
        clearTimeout(objectUpdates.get(updateKey))
      }

      objectUpdates.set(updateKey, setTimeout(async () => {
        try {
          const { error } = await supabase
            .from('objects')
            .update(updateData)
            .eq('id', id)
            .eq('canvas_id', session.canvasId) // Ensure user can only update objects in their canvas

          if (error) throw error

          // Broadcast to other users in canvas (don't send back to sender to avoid conflicts)
          socket.to(`canvas:${session.canvasId}`).emit('object-updated', data)

          console.log(`Object ${id} updated in canvas ${session.canvasId}`)
        } catch (error) {
          console.error('Error updating object:', error)
        }
        objectUpdates.delete(updateKey)
      }, 16)) // Throttle to 60fps for smooth dragging

    } catch (error) {
      console.error('Error queuing object update:', error)
    }
  })

  // Handle object deletion
  socket.on('delete-object', async (data) => {
    const session = userSessions.get(socket.id)
    if (!session) return

    try {
      const { id } = data

      const { error } = await supabase
        .from('objects')
        .delete()
        .eq('id', id)
        .eq('canvas_id', session.canvasId) // Ensure user can only delete objects in their canvas

      if (error) throw error

      // Broadcast to other users in canvas (don't send back to deleter)
      socket.to(`canvas:${session.canvasId}`).emit('object-deleted', { id })

      console.log(`Object ${id} deleted from canvas ${session.canvasId}`)
    } catch (error) {
      console.error('Error deleting object:', error)
      socket.emit('error', { message: 'Failed to delete object' })
    }
  })

  // Handle disconnect
  socket.on('disconnect', async () => {
    connectionCount = Math.max(0, connectionCount - 1)

    const session = userSessions.get(socket.id)
    if (session) {
      // Remove from canvas room
      canvasRooms.get(session.canvasId)?.delete(socket.id)

      // Clean up empty rooms
      if (canvasRooms.get(session.canvasId)?.size === 0) {
        canvasRooms.delete(session.canvasId)
      }

      // Remove user session
      userSessions.delete(socket.id)

      // Update database session (delete immediately for clean state)
      removeUserSession(session.userId, session.canvasId)

      // Get user's email for the notification
      const { data: userDataDisconnect } = await supabase.auth.admin.getUserById(session.userId)
      const userEmailDisconnect = userDataDisconnect?.user?.email || `User ${session.userId.substring(0, 8)}`

      // Notify others
      socket.to(`canvas:${session.canvasId}`).emit('user-left', {
        userId: session.userId,
        userEmail: userEmailDisconnect
      })

      console.log(`User ${session.userId} left canvas ${session.canvasId} (connections: ${connectionCount})`)
    } else {
      console.log(`Socket ${socket.id} disconnected (connections: ${connectionCount})`)
    }
  })
})

// Throttled user session updates
const sessionUpdates = new Map()
// Throttled object updates
const objectUpdates = new Map()
// Throttled object creation
const objectCreationUpdates = new Map()

function updateUserSession(userId, canvasId, cursorData) {
  const key = `${userId}-${canvasId}`

  if (sessionUpdates.has(key)) {
    clearTimeout(sessionUpdates.get(key))
  }

  sessionUpdates.set(key, setTimeout(async () => {
    try {
      // Get user's email for storing in session (only if we don't have it cached)
      let sessionUserEmail = null
      try {
        const { data: userDataSession } = await supabase.auth.admin.getUserById(userId)
        sessionUserEmail = userDataSession?.user?.email || null
      } catch (emailError) {
        console.error('Error fetching user email for session update:', emailError)
      }

      await supabase
        .from('user_sessions')
        .upsert({
          user_id: userId,
          canvas_id: canvasId,
          user_email: sessionUserEmail,
          cursor_x: cursorData.x,
          cursor_y: cursorData.y,
          cursor_z: cursorData.z,
          last_seen: new Date().toISOString()
        })

      // Clean up old sessions periodically (every 10 updates)
      if (Math.random() < 0.1) { // 10% chance
        cleanupOldSessions()
      }
    } catch (error) {
      console.error('Error updating user session:', error)
    }
    sessionUpdates.delete(key)
  }, 100))
}

// Clean up old sessions (older than 5 minutes)
async function cleanupOldSessions() {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 300000).toISOString()
    await supabase
      .from('user_sessions')
      .delete()
      .lt('last_seen', fiveMinutesAgo)
  } catch (error) {
    console.error('Error cleaning up old sessions:', error)
  }
}

async function removeUserSession(userId, canvasId) {
  try {
    const { error } = await supabase
      .from('user_sessions')
      .delete()
      .eq('user_id', userId)
      .eq('canvas_id', canvasId)

    if (error) {
      console.error('Error removing user session:', error)
    } else {
      console.log(`🗑️ Removed session for user ${userId} on canvas ${canvasId}`)
    }
  } catch (error) {
    console.error('Error removing user session:', error)
  }
}

// API Routes

// Get canvas list for user
app.get('/api/canvases', async (req, res) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' })
    }

    const { data: user } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (!user) {
      return res.status(401).json({ error: 'Invalid token' })
    }

    const { data: canvases } = await supabase
      .from('canvases')
      .select('*')
      .eq('created_by', user.id)
      .order('updated_at', { ascending: false })

    res.json(canvases || [])
  } catch (error) {
    console.error('Error fetching canvases:', error)
    res.status(500).json({ error: 'Failed to fetch canvases' })
  }
})

// Create new canvas
app.post('/api/canvases', async (req, res) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' })
    }

    const { data: user } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (!user) {
      return res.status(401).json({ error: 'Invalid token' })
    }

    const { name } = req.body
    const { data: canvas, error } = await supabase
      .from('canvases')
      .insert({
        name: name || 'Untitled Canvas',
        created_by: user.id
      })
      .select()
      .single()

    if (error) throw error

    res.json(canvas)
  } catch (error) {
    console.error('Error creating canvas:', error)
    res.status(500).json({ error: 'Failed to create canvas' })
  }
})

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() })
})

const PORT = process.env.PORT || 3001

server.listen(PORT, () => {
  console.log(`CollabCanvas server running on port ${PORT}`)
  console.log(`Socket.io server ready for connections`)
})

