import { supabase } from '../core/database.js'
import {
  userSessions,
  canvasRooms,
  getConnectionCount,
  incrementConnectionCount,
  decrementConnectionCount,
  MAX_CONNECTIONS,
  updateUserSession,
  removeUserSession
} from '../canvas/canvas-operations.js'

export function setupSocketHandlers(io) {
  // Socket.io connection handling
  io.on('connection', (socket) => {
    const currentCount = incrementConnectionCount()

    if (currentCount > MAX_CONNECTIONS) {
      console.log(`Connection rejected: too many connections (${currentCount}/${MAX_CONNECTIONS})`)
      socket.disconnect()
      return
    }

    console.log(`User connected: ${socket.id} (connections: ${currentCount}/${MAX_CONNECTIONS})`)

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
          socket.leave("canvas:" + prevSession.canvasId)
          canvasRooms.get(prevSession.canvasId)?.delete(socket.id)
        }

        // Join new canvas room
        socket.join("canvas:" + canvasId)

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
      const currentCount = decrementConnectionCount()

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

        console.log(`User ${session.userId} left canvas ${session.canvasId} (connections: ${currentCount})`)
      } else {
        console.log(`Socket ${socket.id} disconnected (connections: ${currentCount})`)
      }
    })
  })
}
