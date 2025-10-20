import { supabase } from '../core/database.js'

// Store connected users and their canvas sessions
export const userSessions = new Map() // userId -> { socketId, canvasId, cursor }
export const canvasRooms = new Map() // canvasId -> Set of socketIds
let connectionCount = 0
export const MAX_CONNECTIONS = 100

// Connection count management functions
export function getConnectionCount() {
  return connectionCount
}

export function incrementConnectionCount() {
  connectionCount++
  return connectionCount
}

export function decrementConnectionCount() {
  connectionCount = Math.max(0, connectionCount - 1)
  return connectionCount
}

// Throttled user session updates
export const sessionUpdates = new Map()
// Throttled object updates
export const objectUpdates = new Map()
// Throttled object creation
export const objectCreationUpdates = new Map()

export function updateUserSession(userId, canvasId, cursorData) {
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

export async function removeUserSession(userId, canvasId) {
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

export async function getActiveUserSessions(canvasId) {
  try {
    // Get sessions that are less than 5 minutes old (active users)
    const fiveMinutesAgo = new Date(Date.now() - 300000).toISOString()

    const { data: sessions, error } = await supabase
      .from('user_sessions')
      .select('user_id, canvas_id, user_email, cursor_x, cursor_y, cursor_z, last_seen')
      .eq('canvas_id', canvasId)
      .gt('last_seen', fiveMinutesAgo)
      .order('last_seen', { ascending: false })

    if (error) {
      console.error('Error fetching active user sessions:', error)
      return []
    }

    console.log(`📊 Found ${sessions?.length || 0} active sessions for canvas ${canvasId}`)
    return sessions || []
  } catch (error) {
    console.error('Error getting active user sessions:', error)
    return []
  }
}
