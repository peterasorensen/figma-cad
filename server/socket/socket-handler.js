import { supabase } from '../core/database.js'
import {
  userSessions,
  canvasRooms,
  getConnectionCount,
  incrementConnectionCount,
  decrementConnectionCount,
  MAX_CONNECTIONS,
  updateUserSession,
  removeUserSession,
  getActiveUserSessions,
  getCanvasObjects
} from '../canvas/canvas-operations.js'

// Map to store throttled object update timeouts
const objectUpdates = new Map()

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

        // Save user session to database immediately so other users can see them
        updateUserSession(userId, canvasId, { x: 0, y: 0, z: 0 })

        // Add to canvas room
        if (!canvasRooms.has(canvasId)) {
          canvasRooms.set(canvasId, new Set())
        }
        canvasRooms.get(canvasId).add(socket.id)

        // For testing: skip canvas validation to allow basic functionality without database
        // In production, you'd validate canvas exists in database
        console.log(`📊 Skipping canvas validation for testing: ${canvasId}`)

        // Get real active user sessions and objects from database
        const objects = await getCanvasObjects(canvasId)
        const sessions = await getActiveUserSessions(canvasId)

        // Ensure current user is in the sessions (in case they just joined and session hasn't been saved yet)
        const currentUserInSessions = sessions.some(s => s.user_id === userId)
        if (!currentUserInSessions) {
          // Add current user's session if not found in database
          const { data: userData } = await supabase.auth.admin.getUserById(userId)
          const userEmail = userData?.user?.email || `user${userId.substring(0, 8)}@test.com`

          sessions.push({
            user_id: userId,
            canvas_id: canvasId,
            user_email: userEmail,
            cursor_x: 0,
            cursor_y: 0,
            cursor_z: 0,
            last_seen: new Date().toISOString()
          })
        }

        console.log(`📊 Real sessions loaded for canvas ${canvasId}:`, sessions.length)

        // Send current state to user (includes all sessions)
        socket.emit('canvas-state', {
          objects: objects || [],
          sessions: sessions || []
        })

        // Get current user's email for the join notification
        const { data: userDataJoin } = await supabase.auth.admin.getUserById(userId)
        const displayEmail = userDataJoin?.user?.email || `User ${userId.substring(0, 8)}`

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
      console.log('🔧 SERVER: Received update-object event:', data.id);
      console.log('🔧 SERVER: Update data keys:', Object.keys(data));

      const session = userSessions.get(socket.id)
      if (!session) {
        console.log('🔧 SERVER: No session found for socket');
        return;
      }

      console.log('🔧 SERVER: Session found, canvas ID:', session.canvasId);

      try {
        const { id, ...updateData } = data

        console.log('🔧 SERVER: Processing update for object:', id);
        console.log('🔧 SERVER: Update data contains geometry:', !!updateData.geometry);

        // Throttle object updates to reduce database load
        const updateKey = `${id}-${session.canvasId}`
        console.log('🔧 SERVER: Update key:', updateKey);

        if (objectUpdates.has(updateKey)) {
          clearTimeout(objectUpdates.get(updateKey))
          console.log('🔧 SERVER: Cleared existing timeout');
        }

        objectUpdates.set(updateKey, setTimeout(async () => {
          try {
            console.log('🔧 SERVER: Executing database update...');
            const { error } = await supabase
              .from('objects')
              .update(updateData)
              .eq('id', id)
              .eq('canvas_id', session.canvasId) // Ensure user can only update objects in their canvas

            if (error) {
              console.error('🔧 SERVER: Database update error:', error);
              throw error;
            }

            console.log('🔧 SERVER: Database update successful');

            // Verify the data was actually saved by querying it back
            console.log('🔧 SERVER: Verifying database save...');
            const { data: verifyData, error: verifyError } = await supabase
              .from('objects')
              .select('id, geometry')
              .eq('id', id)
              .eq('canvas_id', session.canvasId)
              .single();

            if (verifyError) {
              console.error('🔧 SERVER: Verification query failed:', verifyError);
            } else {
              console.log('🔧 SERVER: Verification successful');
              console.log('🔧 SERVER: Saved geometry exists:', !!verifyData.geometry);
              if (verifyData.geometry) {
                console.log('🔧 SERVER: Saved geometry keys:', Object.keys(verifyData.geometry));
                if (verifyData.geometry.attributes?.position) {
                  console.log('🔧 SERVER: Saved position vertices:', verifyData.geometry.attributes.position.array.length);
                }
              }
            }

            // Broadcast to other users in canvas (don't send back to sender to avoid conflicts)
            socket.to(`canvas:${session.canvasId}`).emit('object-updated', data)
            console.log('🔧 SERVER: Broadcasted update to other users');

            console.log(`✅ Object ${id} updated in canvas ${session.canvasId}`)
          } catch (error) {
            console.error('❌ Error updating object:', error)
          }
          objectUpdates.delete(updateKey)
        }, 16)) // Throttle to 60fps for smooth dragging

      } catch (error) {
        console.error('❌ Error queuing object update:', error)
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

    // Handle object lock acquisition
    socket.on('acquire-object-lock', (data) => {
      const session = userSessions.get(socket.id)
      if (!session) return

      console.log(`🔒 User ${session.userId} acquiring lock on object ${data.shapeId}`)

      // For now, just broadcast lock acquisition to other users in the canvas
      // In a real implementation, you'd store this in a database
      socket.to(`canvas:${session.canvasId}`).emit('object-lock-acquired', {
        shapeId: data.shapeId,
        userId: session.userId,
        canvasId: session.canvasId
      })
    })

    // Handle object lock release
    socket.on('release-object-lock', (data) => {
      const session = userSessions.get(socket.id)
      if (!session) return

      console.log(`🔓 User ${session.userId} releasing lock on object ${data.shapeId}`)

      // For now, just broadcast lock release to other users in the canvas
      // In a real implementation, you'd update this in a database
      socket.to(`canvas:${session.canvasId}`).emit('object-lock-released', {
        shapeId: data.shapeId,
        userId: session.userId,
        canvasId: session.canvasId
      })
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
