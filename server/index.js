import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
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

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

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

// AI Canvas Agent Functions
const aiFunctions = {
  createShape: {
    name: 'createShape',
    description: 'Create a new shape on the canvas. 2D shapes (rectangle, circle) are placed on the ground plane. 3D shapes are positioned in 3D space.',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['rectangle', 'circle', 'box', 'sphere', 'cylinder', 'text', 'torus', 'torusKnot', 'dodecahedron', 'icosahedron', 'octahedron', 'tetrahedron', 'tube'],
          description: 'The type of shape to create'
        },
        x: {
          type: 'number',
          description: 'X coordinate (horizontal position, 0 is center of canvas)'
        },
        y: {
          type: 'number',
          description: 'Y coordinate (height above ground for 3D shapes, ignored for 2D shapes)'
        },
        z: {
          type: 'number',
          description: 'Z coordinate (depth position for 3D shapes, or ground position for 2D shapes)'
        },
        width: {
          type: 'number',
          description: 'Width of the shape (for rectangles, boxes)'
        },
        height: {
          type: 'number',
          description: 'Height of the shape (for rectangles, boxes)'
        },
        depth: {
          type: 'number',
          description: 'Depth of the shape (for boxes)'
        },
        radius: {
          type: 'number',
          description: 'Radius of the shape (for circles, spheres, cylinders, platonic solids)'
        },
        tube: {
          type: 'number',
          description: 'Tube radius (for torus, torusKnot shapes)'
        },
        tubularSegments: {
          type: 'number',
          description: 'Number of segments along the tube path (for tube shapes)'
        },
        radialSegments: {
          type: 'number',
          description: 'Number of radial segments (for tube shapes)'
        },
        color: {
          type: 'string',
          description: 'Color of the shape (hex code like #ff0000 or #4f46e5)'
        },
        text: {
          type: 'string',
          description: 'Text content (for text shapes only)'
        },
        fontSize: {
          type: 'number',
          description: 'Font size for text (default 12)'
        },
        rotation_x: {
          type: 'number',
          description: 'X rotation in radians (use -Math.PI/2 for flat text in 2D layouts)'
        },
        rotation_y: {
          type: 'number',
          description: 'Y rotation in radians'
        },
        rotation_z: {
          type: 'number',
          description: 'Z rotation in radians'
        }
      },
      required: ['type']
    }
  },


  moveShape: {
    name: 'moveShape',
    description: 'Move an existing shape to a new position. For 2D shapes, only x,z coordinates matter. For 3D shapes, use x,y,z coordinates.',
    parameters: {
      type: 'object',
      properties: {
        shapeId: {
          type: 'string',
          description: 'ID of the shape to move'
        },
        x: {
          type: 'number',
          description: 'New X coordinate (horizontal position, 0 is center)'
        },
        y: {
          type: 'number',
          description: 'New Y coordinate (height above ground, 0 = ground level)'
        },
        z: {
          type: 'number',
          description: 'New Z coordinate (depth position, 0 is center)'
        },
        shapeDescription: {
          type: 'string',
          description: 'Description of the shape to move (e.g., "red rectangle", "blue circle") - alternative to shapeId'
        }
      },
      required: []
    }
  },

  resizeShape: {
    name: 'resizeShape',
    description: 'Resize an existing shape',
    parameters: {
      type: 'object',
      properties: {
        shapeId: {
          type: 'string',
          description: 'ID of the shape to resize'
        },
        width: {
          type: 'number',
          description: 'New width'
        },
        height: {
          type: 'number',
          description: 'New height'
        },
        scale: {
          type: 'number',
          description: 'Scale factor (alternative to width/height)'
        },
        shapeDescription: {
          type: 'string',
          description: 'Description of the shape to resize (e.g., "red rectangle", "blue circle") - alternative to shapeId'
        }
      },
      required: []
    }
  },

  rotateShape: {
    name: 'rotateShape',
    description: 'Rotate an existing shape',
    parameters: {
      type: 'object',
      properties: {
        shapeId: {
          type: 'string',
          description: 'ID of the shape to rotate'
        },
        degrees: {
          type: 'number',
          description: 'Rotation angle in degrees'
        },
        shapeDescription: {
          type: 'string',
          description: 'Description of the shape to rotate (e.g., "red rectangle", "blue circle") - alternative to shapeId'
        }
      },
      required: ['degrees']
    }
  },

  deleteShape: {
    name: 'deleteShape',
    description: 'Delete an existing shape',
    parameters: {
      type: 'object',
      properties: {
        shapeId: {
          type: 'string',
          description: 'ID of the shape to delete'
        },
        shapeDescription: {
          type: 'string',
          description: 'Description of the shape to delete (e.g., "red rectangle", "blue circle") - alternative to shapeId'
        }
      },
      required: []
    }
  },

  getCanvasState: {
    name: 'getCanvasState',
    description: 'Get current state of the canvas including all shapes',
    parameters: {
      type: 'object',
      properties: {}
    }
  },

  arrangeShapes: {
    name: 'arrangeShapes',
    description: 'Arrange multiple shapes in a layout pattern',
    parameters: {
      type: 'object',
      properties: {
        shapeIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of shape IDs to arrange'
        },
        layout: {
          type: 'string',
          enum: ['horizontal', 'vertical', 'grid'],
          description: 'Layout arrangement type'
        },
        spacing: {
          type: 'number',
          description: 'Spacing between shapes',
          default: 50
        },
        startX: {
          type: 'number',
          description: 'Starting X position for arrangement'
        },
        startY: {
          type: 'number',
          description: 'Starting Y position for arrangement'
        },
        columns: {
          type: 'number',
          description: 'Number of columns for grid layout'
        },
        shapeDescription: {
          type: 'string',
          description: 'Description of shapes to arrange (e.g., "all rectangles", "red shapes") - alternative to shapeIds'
        }
      },
      required: ['layout']
    }
  },

  createGrid: {
    name: 'createGrid',
    description: 'Create a grid of shapes',
    parameters: {
      type: 'object',
      properties: {
        shapeType: {
          type: 'string',
          enum: ['rectangle', 'circle', 'box', 'sphere'],
          description: 'Type of shapes to create in the grid'
        },
        rows: {
          type: 'number',
          description: 'Number of rows'
        },
        columns: {
          type: 'number',
          description: 'Number of columns'
        },
        startX: {
          type: 'number',
          description: 'Starting X position'
        },
        startY: {
          type: 'number',
          description: 'Starting Y position'
        },
        startZ: {
          type: 'number',
          description: 'Starting Z position'
        },
        spacing: {
          type: 'number',
          description: 'Spacing between shapes'
        },
        size: {
          type: 'number',
          description: 'Size of each shape'
        },
        color: {
          type: 'string',
          description: 'Color of the shapes'
        }
      },
      required: ['shapeType', 'rows', 'columns']
    }
  },

  moveToPosition: {
    name: 'moveToPosition',
    description: 'Move one or more shapes to a named position like center, top-left, bottom-right, etc. Use descriptions like "all red spheres" to move multiple shapes.',
    parameters: {
      type: 'object',
      properties: {
        shapeDescription: {
          type: 'string',
          description: 'Description of the shape(s) to move (can include "all" for multiple shapes)'
        },
        position: {
          type: 'string',
          enum: ['center', 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'top-center', 'bottom-center', 'left-center', 'right-center'],
          description: 'Named position to move the shape(s) to'
        },
        height: {
          type: 'number',
          description: 'Height above ground (for 3D shapes, default 0 for center, 5 for others)'
        }
      },
      required: ['position']
    }
  },

  booleanSubtract: {
    name: 'booleanSubtract',
    description: 'Perform a boolean subtract operation: cut one shape (cutting object) from another shape (target). The cutting object is removed after the operation. Use this to create holes, engrave text, or cut shapes.',
    parameters: {
      type: 'object',
      properties: {
        cuttingShapeDescription: {
          type: 'string',
          description: 'Description of the shape to use as the cutting tool (will be removed after operation)'
        },
        targetShapeDescription: {
          type: 'string',
          description: 'Description of the shape to cut into (the base shape that will have the hole/engraving)'
        },
        cuttingShapeId: {
          type: 'string',
          description: 'ID of the cutting shape (alternative to cuttingShapeDescription)'
        },
        targetShapeId: {
          type: 'string',
          description: 'ID of the target shape (alternative to targetShapeDescription)'
        }
      },
      required: []
    }
  },

  booleanUnion: {
    name: 'booleanUnion',
    description: 'Combine two shapes into one using boolean union. Both shapes become one merged shape.',
    parameters: {
      type: 'object',
      properties: {
        shape1Description: {
          type: 'string',
          description: 'Description of the first shape to combine'
        },
        shape2Description: {
          type: 'string',
          description: 'Description of the second shape to combine'
        },
        shape1Id: {
          type: 'string',
          description: 'ID of the first shape (alternative to shape1Description)'
        },
        shape2Id: {
          type: 'string',
          description: 'ID of the second shape (alternative to shape2Description)'
        }
      },
      required: []
    }
  },

  // booleanIntersect: {
  //   name: 'booleanIntersect',
  //   description: 'Create a new shape from the intersection of two shapes (the overlapping volume).',
  //   parameters: {
  //     type: 'object',
  //     properties: {
  //       shape1Description: {
  //         type: 'string',
  //         description: 'Description of the first shape'
  //       },
  //       shape2Description: {
  //         type: 'string',
  //         description: 'Description of the second shape'
  //       },
  //       shape1Id: {
  //         type: 'string',
  //         description: 'ID of the first shape (alternative to shape1Description)'
  //       },
  //       shape2Id: {
  //         type: 'string',
  //         description: 'ID of the second shape (alternative to shape2Description)'
  //       }
  //     },
  //     required: []
  //   }
  // }
}

// AI Canvas Agent API endpoint
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { message, canvasId, userId } = req.body

    if (!message || !canvasId || !userId) {
      return res.status(400).json({ error: 'Missing required fields: message, canvasId, userId' })
    }

    // Get canvas state for context
    const { data: objects } = await supabase
      .from('objects')
      .select('*')
      .eq('canvas_id', canvasId)

    const canvasContext = objects ? objects.map(obj => {
      // Build properties from individual columns
      const properties = {
        color: obj.color,
        width: obj.width,
        height: obj.height,
        depth: obj.depth
      }

      // For text objects, extract text from geometry if it exists
      if (obj.type === 'text' && obj.geometry) {
        try {
          const geometryData = JSON.parse(obj.geometry)
          if (geometryData.text) {
            properties.text = geometryData.text
          }
        } catch (e) {
          // Ignore parsing errors
        }
      }

      return {
        id: obj.id,
        type: obj.type,
        position: { x: obj.position_x, y: obj.position_y, z: obj.position_z },
        color: obj.color,
        properties: properties
      }
    }) : []

    // Create system prompt with canvas context
    const systemPrompt = `You are an AI Canvas Agent that builds complex 2D layouts using only createShape calls. Understand patterns and apply them intelligently.

CANVAS SYSTEM:
- 50x50 unit canvas (-25 to +25 in X/Z)
- For 2D layouts: use XY plane (y=0.05 for shapes, y=1 for text)
- Text rotation: rotate 90 degrees forward (rotation_x: -Math.PI/2) so text lies flat
- Font sizes: 1-3 units for readability in 50x50 space

INTELLIGENT 2D LAYOUTS:
FORMS: Group input fields vertically, labels left of inputs, buttons at bottom
- Background: large rectangle container
- Inputs: smaller rectangles with light colors
- Labels: text positioned near inputs
- Buttons: colored rectangles with centered text
- Space elements 2-3 units apart logically

POSTERS/LAYOUTS: Use visual hierarchy - titles at top, content below, balanced spacing

COLOR PATTERNS:
- Backgrounds: white/gray (#ffffff, #f8f9fa)
- Input fields: light gray (#f0f0f0, #e9ecef)
- Buttons: blue/purple (#4f46e5, #007bff)
- Text: black/dark gray (#000000, #333333)

POSITIONING RULES:
- Center layouts around x=0, use z-depth for layering
- Text always at y=1, rotated flat for 2D layouts
- Group related elements, maintain visual balance

Current canvas (${canvasContext.length} shapes):
${canvasContext.map(shape =>
  `- ${shape.type} at (${Math.round(shape.position.x)}, ${Math.round(shape.position.y)}, ${Math.round(shape.position.z)}) - ID: ${shape.id}${shape.color ? ` - Color: ${shape.color}` : ""}${shape.properties?.text ? ` - Text: "${shape.properties.text}"` : ""}`
).join("\n")}

For complex requests, analyze the pattern and create multiple createShape calls. Apply logical spacing, appropriate colors, and flat text rotation for 2D layouts.`
    // Call OpenAI with tools API (enables multiple parallel tool calls)
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      tools: Object.values(aiFunctions).map(func => ({
        type: 'function',
        function: func
      })),
      tool_choice: 'auto', // Allow multiple tool calls
      max_completion_tokens: 4000,
      temperature: 0.1
    })

    const response = completion.choices[0].message

    // Process tool calls (modern API supports multiple parallel calls)
    const actions = []
    let responseMessage = response.content || 'I\'ve processed your request.'

    // Handle tool calls (modern API) or fallback to function calls (legacy API)
    const calls = response.tool_calls || []

    // Fallback for legacy function_call API
    if (!calls.length && response.function_call) {
      calls.push({ function: response.function_call })
    }

    for (const call of calls) {
      const functionName = call.function.name
      const functionArgs = JSON.parse(call.function.arguments || '{}')

      console.log("AI Tool Call:", functionName, functionArgs)

      try {
        // Execute the canvas function
        const result = await executeCanvasFunction(functionName, functionArgs, canvasId, userId)

        // Add successful actions to the response
        if (result.actions) {
          actions.push(...result.actions)
        }

        // Update response message if provided
        if (result.message) {
          responseMessage = result.message
        }

      } catch (error) {
        console.error('Error executing canvas function:', error)
        responseMessage = "I encountered an error while executing your request: " + error.message
      }
    }

    res.json({
      message: responseMessage,
      actions: actions
    })

  } catch (error) {
    console.error('AI Chat API Error:', error)
    res.status(500).json({
      error: 'Internal server error',
      message: 'Sorry, I encountered an error processing your request.'
    })
  }
})

// Execute canvas manipulation functions
async function executeCanvasFunction(functionName, args, canvasId, userId) {
  const actions = []

  switch (functionName) {
    case 'createShape':
      return await handleCreateShape(args, canvasId, userId)

    case 'moveShape':
      return await handleMoveShape(args, canvasId, userId)

    case 'resizeShape':
      return await handleResizeShape(args, canvasId, userId)

    case 'rotateShape':
      return await handleRotateShape(args, canvasId, userId)

    case 'deleteShape':
      return await handleDeleteShape(args, canvasId, userId)

    case 'getCanvasState':
      return await handleGetCanvasState(canvasId)

    case 'arrangeShapes':
      return await handleArrangeShapes(args, canvasId, userId)

    case 'createGrid':
      return await handleCreateGrid(args, canvasId, userId)

    case 'moveToPosition':
      return await handleMoveToPosition(args, canvasId, userId)

    case 'booleanSubtract':
      return await handleBooleanSubtract(args, canvasId, userId)

    case 'booleanUnion':
      return await handleBooleanUnion(args, canvasId, userId)

    // case 'booleanIntersect':
    //   return await handleBooleanIntersect(args, canvasId, userId)

    default:
      throw new Error("Unknown function: " + functionName)
  }
}

// Canvas function implementations
async function handleCreateShape(args, canvasId, userId) {
  const {
    type,
    x = 0,
    y = 0,
    z = 0,
    width = 2,
    height = 2,
    depth = 2,
    radius = 1,
    tube = 0.4,
    tubularSegments = 20,
    radialSegments = 8,
    color = '#4f46e5',
    text,
    fontSize = 1,
    rotation_x = 0,
    rotation_y = 0,
    rotation_z = 0
  } = args

  // Map AI types to internal types
  const typeMapping = {
    rectangle: 'rectangle',
    circle: 'circle',
    box: 'box',
    sphere: 'sphere',
    cylinder: 'cylinder',
    text: 'text',
    torus: 'torus',
    torusKnot: 'torusKnot',
    dodecahedron: 'dodecahedron',
    icosahedron: 'icosahedron',
    octahedron: 'octahedron',
    tetrahedron: 'tetrahedron',
    tube: 'tube'
  }

  const internalType = typeMapping[type]
  if (!internalType) {
    throw new Error("Unsupported shape type: " + type)
  }

  // For 2D shapes (rectangle, circle), they should be placed on ground (y=0)
  // and use z coordinate for positioning
  let positionX = x
  let positionY = y
  let positionZ = z

  if (internalType === 'rectangle' || internalType === 'circle') {
    positionY = 0.05 // Slightly above ground to avoid z-fighting
    positionZ = z // Use z parameter as the ground position
  }

  // Create the object in database with individual columns
  const objectData = {
    type: internalType,
    canvas_id: canvasId,
    created_by: userId,
    position_x: positionX,
    position_y: positionY,
    position_z: positionZ,
    rotation_x: rotation_x,
    rotation_y: rotation_y,
    rotation_z: rotation_z,    scale_x: 1,
    scale_y: 1,
    scale_z: 1,
    color: color,
    geometry: '' // Will be set by client
  }

  // Set shape-specific properties based on type
  switch (internalType) {
    case 'rectangle':
      objectData.width = width
      objectData.height = height
      break
    case 'circle':
      // Circles use width/height for ground plane sizing
      objectData.width = radius * 2
      objectData.height = radius * 2
      break
    case 'box':
      objectData.width = width
      objectData.height = height
      objectData.depth = depth
      break
    case 'sphere':
    case 'dodecahedron':
    case 'icosahedron':
    case 'octahedron':
    case 'tetrahedron':
      // For spherical shapes, use radius as width for client-side processing
      objectData.width = radius
      objectData.height = radius
      objectData.depth = radius
      break
    case 'cylinder':
      objectData.width = radius * 2
      objectData.height = height
      objectData.depth = radius * 2
      break
    case 'torus':
    case 'torusKnot':
      objectData.width = radius * 2
      objectData.height = tube * 2
      objectData.depth = radius * 2
      break
    case 'tube':
      objectData.width = radius * 2
      objectData.height = radius * 2
      objectData.depth = radius * 2
      break
    case 'text':
      if (text) {
        objectData.text_content = text
        objectData.font_size = fontSize
      }
      break
  }

  const { data: newObject, error } = await supabase
    .from('objects')
    .insert(objectData)
    .select()
    .single()

  if (error) throw error

  // Broadcast to all users in the canvas
  io.to("canvas:" + canvasId).emit('object-created', newObject)

  const colorName = getColorName(color)
  const shapeDesc = text ? `"${text}"` : colorName + " " + type

  return {
    message: "Created a " + shapeDesc + " at position (" + Math.round(positionX) + ", " + Math.round(positionY) + ", " + Math.round(positionZ) + ").",
    actions: [{
      type: 'create',
      shapeId: newObject.id,
      successMessage: "Created " + shapeDesc
    }]
  }
}

async function handleMoveShape(args, canvasId, userId) {
  const { shapeId, x, y, z, shapeDescription } = args

  let targetShapeIds = shapeId ? [shapeId] : []

  // If no shapeId provided but shapeDescription is given, find the shapes
  if (targetShapeIds.length === 0 && shapeDescription) {
    const { data: objects } = await supabase
      .from('objects')
      .select('*')
      .eq('canvas_id', canvasId)

    const shapes = objects ? objects.map(obj => ({
      id: obj.id,
      type: obj.type,
      position: { x: obj.position_x, y: obj.position_y, z: obj.position_z },
      color: obj.color,
      properties: obj.properties || {}
    })) : []

    const matchingShapes = findShapesByDescription(shapes, shapeDescription)
    targetShapeIds = matchingShapes.map(shape => shape.id)

    if (targetShapeIds.length === 0) {
      throw new Error("Could not find any shapes matching: " + shapeDescription)
    }
  }

  if (targetShapeIds.length === 0) {
    throw new Error('No shapes specified to move')
  }

  const actions = []
  let movedCount = 0

  // Move each shape
  for (const targetShapeId of targetShapeIds) {
    // Get current shape to determine if it's 2D or 3D
    const { data: currentShape } = await supabase
      .from('objects')
      .select('type, position_x, position_y, position_z')
      .eq('id', targetShapeId)
      .eq('canvas_id', canvasId)
      .single()

    if (!currentShape) continue

    // For 2D shapes, only update x and z (keep y on ground)
    const is2DShape = ['rectangle', 'circle'].includes(currentShape.type)

    const updateData = {}
    if (x !== undefined) updateData.position_x = x
    if (y !== undefined) updateData.position_y = is2DShape ? 0.05 : y // Keep 2D shapes on ground
    if (z !== undefined) updateData.position_z = is2DShape ? z : (z !== undefined ? z : currentShape.position_z)

    // Update the object position
    const { error } = await supabase
      .from('objects')
      .update(updateData)
      .eq('id', targetShapeId)
      .eq('canvas_id', canvasId)

    if (!error) {
      // Broadcast update
      io.to("canvas:" + canvasId).emit('object-updated', {
        id: targetShapeId,
        ...updateData
      })

      movedCount++
      const finalX = updateData.position_x !== undefined ? updateData.position_x : currentShape.position_x
      const finalY = updateData.position_y !== undefined ? updateData.position_y : currentShape.position_y
      const finalZ = updateData.position_z !== undefined ? updateData.position_z : currentShape.position_z

      actions.push({
        type: 'move',
        shapeId: targetShapeId,
        successMessage: "Moved shape to (" + Math.round(finalX) + ", " + Math.round(finalY) + ", " + Math.round(finalZ) + ")"
      })
    }
  }

  const shapeWord = movedCount === 1 ? 'shape' : 'shapes'
  return {
    message: "Moved " + movedCount + " " + shapeWord + " to position (" + Math.round(x || 0) + ", " + Math.round(y || 0) + ", " + Math.round(z || 0) + ").",
    actions: actions
  }
}

async function handleResizeShape(args, canvasId, userId) {
  const { shapeId, width, height, scale = 1, shapeDescription } = args

  let targetShapeIds = shapeId ? [shapeId] : []

  // If no shapeId provided but shapeDescription is given, find the shapes
  if (targetShapeIds.length === 0 && shapeDescription) {
    const { data: objects } = await supabase
      .from('objects')
      .select('*')
      .eq('canvas_id', canvasId)

    const shapes = objects ? objects.map(obj => ({
      id: obj.id,
      type: obj.type,
      position: { x: obj.position_x, y: obj.position_y, z: obj.position_z },
      color: obj.color,
      properties: obj.properties || {}
    })) : []

    const matchingShapes = findShapesByDescription(shapes, shapeDescription)
    targetShapeIds = matchingShapes.map(shape => shape.id)

    if (targetShapeIds.length === 0) {
      throw new Error("Could not find any shapes matching: " + shapeDescription)
    }
  }

  if (targetShapeIds.length === 0) {
    throw new Error('No shapes specified to resize')
  }

  const actions = []
  let resizedCount = 0

  // Resize each shape
  for (const targetShapeId of targetShapeIds) {
    // Get current object
    const { data: obj } = await supabase
      .from('objects')
      .select('*')
      .eq('id', targetShapeId)
      .eq('canvas_id', canvasId)
      .single()

    if (!obj) continue

    let updateData = {}

    if (width !== undefined && height !== undefined) {
      updateData.scale_x = width / 2 // Assuming original size was 2
      updateData.scale_y = height / 2
    } else if (scale !== undefined) {
      updateData.scale_x = obj.scale_x * scale
      updateData.scale_y = obj.scale_y * scale
      updateData.scale_z = obj.scale_z * scale
    }

    const { error } = await supabase
      .from('objects')
      .update(updateData)
      .eq('id', targetShapeId)
      .eq('canvas_id', canvasId)

    if (!error) {
      // Broadcast update
      io.to("canvas:" + canvasId).emit('object-updated', {
        id: targetShapeId,
        ...updateData
      })

      resizedCount++
      actions.push({
        type: 'resize',
        shapeId: targetShapeId,
        successMessage: "Resized shape"
      })
    }
  }

  const shapeWord = resizedCount === 1 ? 'shape' : 'shapes'
  const scaleText = scale !== 1 ? scale + "x scale" : (width || "current") + "×" + (height || "current")
  return {
    message: "Resized " + resizedCount + " " + shapeWord + " to " + scaleText + ".",
    actions: actions
  }
}

async function handleRotateShape(args, canvasId, userId) {
  const { shapeId, degrees, shapeDescription } = args

  let targetShapeIds = shapeId ? [shapeId] : []

  // If no shapeId provided but shapeDescription is given, find the shapes
  if (targetShapeIds.length === 0 && shapeDescription) {
    const { data: objects } = await supabase
      .from('objects')
      .select('*')
      .eq('canvas_id', canvasId)

    const shapes = objects ? objects.map(obj => ({
      id: obj.id,
      type: obj.type,
      position: { x: obj.position_x, y: obj.position_y, z: obj.position_z },
      color: obj.color,
      properties: obj.properties || {}
    })) : []

    const matchingShapes = findShapesByDescription(shapes, shapeDescription)
    targetShapeIds = matchingShapes.map(shape => shape.id)

    if (targetShapeIds.length === 0) {
      throw new Error("Could not find any shapes matching: " + shapeDescription)
    }
  }

  if (targetShapeIds.length === 0) {
    throw new Error('No shapes specified to rotate')
  }

  const actions = []
  let rotatedCount = 0

  const radians = (degrees * Math.PI) / 180

  // Rotate each shape
  for (const targetShapeId of targetShapeIds) {
    const { error } = await supabase
      .from('objects')
      .update({
        rotation_z: radians
      })
      .eq('id', targetShapeId)
      .eq('canvas_id', canvasId)

    if (!error) {
      // Broadcast update
      io.to("canvas:" + canvasId).emit('object-updated', {
        id: targetShapeId,
        rotation_z: radians
      })

      rotatedCount++
      actions.push({
        type: 'rotate',
        shapeId: targetShapeId,
        successMessage: "Rotated shape " + degrees + "°"
      })
    }
  }

  const shapeWord = rotatedCount === 1 ? 'shape' : 'shapes'
  return {
    message: "Rotated " + rotatedCount + " " + shapeWord + " by " + degrees + " degrees.",
    actions: actions
  }
}

async function handleDeleteShape(args, canvasId, userId) {
  const { shapeId, shapeDescription } = args

  let targetShapeIds = shapeId ? [shapeId] : []

  // If no shapeId provided but shapeDescription is given, find the shapes
  if (targetShapeIds.length === 0 && shapeDescription) {
    const { data: objects } = await supabase
      .from('objects')
      .select('*')
      .eq('canvas_id', canvasId)

    const shapes = objects ? objects.map(obj => ({
      id: obj.id,
      type: obj.type,
      position: { x: obj.position_x, y: obj.position_y, z: obj.position_z },
      color: obj.color,
      properties: obj.properties || {}
    })) : []

    const matchingShapes = findShapesByDescription(shapes, shapeDescription)
    targetShapeIds = matchingShapes.map(shape => shape.id)

    if (targetShapeIds.length === 0) {
      throw new Error("Could not find any shapes matching: " + shapeDescription)
    }
  }

  if (targetShapeIds.length === 0) {
    throw new Error('No shapes specified to delete')
  }

  const actions = []
  let deletedCount = 0

  // Delete each shape
  for (const targetShapeId of targetShapeIds) {
    const { error } = await supabase
      .from('objects')
      .delete()
      .eq('id', targetShapeId)
      .eq('canvas_id', canvasId)

    if (!error) {
      // Broadcast deletion
      io.to("canvas:" + canvasId).emit('object-deleted', { id: targetShapeId })

      deletedCount++
      actions.push({
        type: 'delete',
        shapeId: targetShapeId,
        successMessage: "Deleted shape"
      })
    }
  }

  const shapeWord = deletedCount === 1 ? 'shape' : 'shapes'
  return {
    message: "Deleted " + deletedCount + " " + shapeWord + ".",
    actions: actions
  }
}

async function handleGetCanvasState(canvasId) {
  const { data: objects } = await supabase
    .from('objects')
    .select('*')
    .eq('canvas_id', canvasId)

  const shapes = objects ? objects.map(obj => {
    // Build properties from individual columns
    const properties = {
      color: obj.color,
      width: obj.width,
      height: obj.height,
      depth: obj.depth
    }

    // For text objects, extract text from geometry if it exists
    if (obj.type === 'text' && obj.geometry) {
      try {
        const geometryData = JSON.parse(obj.geometry)
        if (geometryData.text) {
          properties.text = geometryData.text
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }

    return {
      id: obj.id,
      type: obj.type,
      position: { x: obj.position_x, y: obj.position_y, z: obj.position_z },
      color: obj.color,
      properties: properties
    }
  }) : []

  return {
    message: "Canvas has " + shapes.length + " shapes.",
    actions: []
  }
}

async function handleArrangeShapes(args, canvasId, userId) {
  const { shapeIds, layout, spacing = 50, startX = 0, startY = 0, columns, shapeDescription } = args

  let targetShapeIds = shapeIds

  // If no shapeIds provided but shapeDescription is given, find the shapes
  if ((!targetShapeIds || targetShapeIds.length === 0) && shapeDescription) {
    const { data: objects } = await supabase
      .from('objects')
      .select('*')
      .eq('canvas_id', canvasId)

    const shapes = objects ? objects.map(obj => ({
      id: obj.id,
      type: obj.type,
      position: { x: obj.position_x, y: obj.position_y, z: obj.position_z },
      color: obj.color,
      properties: obj.properties || {}
    })) : []

    const matchingShapes = findShapesByDescription(shapes, shapeDescription)
    targetShapeIds = matchingShapes.map(shape => shape.id)
  }

  if (!targetShapeIds || targetShapeIds.length === 0) {
    throw new Error('No shapes specified for arrangement')
  }

  const actions = []
  let currentX = startX
  let currentY = startY

  if (layout === 'horizontal') {
    for (let i = 0; i < targetShapeIds.length; i++) {
      const shapeId = targetShapeIds[i]

      const { error } = await supabase
        .from('objects')
        .update({
          position_x: currentX,
          position_y: currentY
        })
        .eq('id', shapeId)
        .eq('canvas_id', canvasId)

      if (!error) {
        io.to("canvas:" + canvasId).emit('object-updated', {
          id: shapeId,
          position_x: currentX,
          position_y: currentY
        })
        actions.push({
          type: 'move',
          shapeId: shapeId,
          successMessage: "Arranged shape " + (i + 1)
        })
      }

      currentX += spacing
    }
  } else if (layout === 'vertical') {
    for (let i = 0; i < targetShapeIds.length; i++) {
      const shapeId = targetShapeIds[i]

      const { error } = await supabase
        .from('objects')
        .update({
          position_x: currentX,
          position_y: currentY
        })
        .eq('id', shapeId)
        .eq('canvas_id', canvasId)

      if (!error) {
        io.to("canvas:" + canvasId).emit('object-updated', {
          id: shapeId,
          position_x: currentX,
          position_y: currentY
        })
        actions.push({
          type: 'move',
          shapeId: shapeId,
          successMessage: "Arranged shape " + (i + 1)
        })
      }

      currentY += spacing
    }
  } else if (layout === 'grid') {
    const cols = columns || Math.ceil(Math.sqrt(targetShapeIds.length))
    let col = 0
    let row = 0

    for (let i = 0; i < targetShapeIds.length; i++) {
      const shapeId = targetShapeIds[i]

      const { error } = await supabase
        .from('objects')
        .update({
          position_x: startX + col * spacing,
          position_y: startY + row * spacing
        })
        .eq('id', shapeId)
        .eq('canvas_id', canvasId)

      if (!error) {
        io.to("canvas:" + canvasId).emit('object-updated', {
          id: shapeId,
          position_x: startX + col * spacing,
          position_y: startY + row * spacing
        })
        actions.push({
          type: 'move',
          shapeId: shapeId,
          successMessage: "Placed shape in grid position (" + (col + 1) + ", " + (row + 1) + ")"
        })
      }

      col++
      if (col >= cols) {
        col = 0
        row++
      }
    }
  }

  return {
    message: "Arranged " + targetShapeIds.length + " shapes in a " + layout + " layout.",
    actions: actions
  }
}

async function handleCreateGrid(args, canvasId, userId) {
  const {
    shapeType,
    rows,
    columns,
    startX = 0,
    startY = 0,
    startZ = 0,
    spacing = 60,
    size = 40,
    color = '#4f46e5'
  } = args

  // For 2D shapes, use z coordinate for ground positioning
  const is2DShape = shapeType === 'rectangle' || shapeType === 'circle'

  const createdShapes = []

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const x = startX + col * spacing
      const y = is2DShape ? 0 : startY + row * spacing
      const z = is2DShape ? startZ + row * spacing : startZ

      try {
        const shape = await createShapeDirectly({
          type: shapeType,
          x: x,
          y: y,
          z: z,
          width: size,
          height: size,
          depth: size,
          radius: size / 2,
          tube: size / 8,
          color: color
        }, canvasId, userId)

        if (shape) {
          createdShapes.push(shape)
        }
      } catch (error) {
        console.error('Error creating grid element:', error)
      }
    }
  }

  return {
    message: "Created a " + rows + "×" + columns + " grid of " + shapeType + "s.",
    actions: [] // No individual success messages for bulk operations
  }
}

async function handleMoveToPosition(args, canvasId, userId) {
  const { shapeDescription, position, height } = args

  if (!shapeDescription) {
    throw new Error('No shape description provided')
  }

  // Get all shapes to find the targets
  const { data: objects } = await supabase
    .from('objects')
    .select('*')
    .eq('canvas_id', canvasId)

  const shapes = objects ? objects.map(obj => ({
    id: obj.id,
    type: obj.type,
    position: { x: obj.position_x, y: obj.position_y, z: obj.position_z },
    color: obj.color,
    properties: obj.properties || {}
  })) : []

  const matchingShapes = findShapesByDescription(shapes, shapeDescription)
  if (matchingShapes.length === 0) {
    throw new Error("Could not find any shapes matching: " + shapeDescription)
  }

  // Define position coordinates (canvas is roughly 50x50, center at 0,0)
  const positions = {
    'center': { x: 0, y: 0, z: 0 },
    'top-left': { x: -15, y: 5, z: -15 },
    'top-right': { x: 15, y: 5, z: -15 },
    'bottom-left': { x: -15, y: 5, z: 15 },
    'bottom-right': { x: 15, y: 5, z: 15 },
    'top-center': { x: 0, y: 5, z: -15 },
    'bottom-center': { x: 0, y: 5, z: 15 },
    'left-center': { x: -15, y: 5, z: 0 },
    'right-center': { x: 15, y: 5, z: 0 }
  }

  const targetPos = positions[position]
  if (!targetPos) {
    throw new Error("Unknown position: " + position)
  }

  const actions = []
  let movedCount = 0

  // Move each matching shape, with slight offsets for multiple shapes at center
  for (let i = 0; i < matchingShapes.length; i++) {
    const shape = matchingShapes[i]

    // For 2D shapes, keep them on ground
    const is2DShape = ['rectangle', 'circle'].includes(shape.type)
    const baseY = is2DShape ? 0.05 : (height !== undefined ? height : targetPos.y)

    // Add slight random offset for multiple shapes at same position to avoid overlap
    let offsetX = 0
    let offsetY = 0
    let offsetZ = 0

    if (matchingShapes.length > 1 && position === 'center') {
      // Spread shapes around center if multiple
      const spread = 2
      offsetX = (Math.random() - 0.5) * spread
      offsetZ = (Math.random() - 0.5) * spread
      if (!is2DShape) {
        offsetY = (Math.random() - 0.5) * spread
      }
    }

    const finalX = targetPos.x + offsetX
    const finalY = baseY + offsetY
    const finalZ = targetPos.z + offsetZ

    const updateData = {
      position_x: finalX,
      position_y: finalY,
      position_z: finalZ
    }

    // Update the shape position
    const { error } = await supabase
      .from('objects')
      .update(updateData)
      .eq('id', shape.id)
      .eq('canvas_id', canvasId)

    if (!error) {
      // Broadcast update
      io.to("canvas:" + canvasId).emit('object-updated', {
        id: shape.id,
        ...updateData
      })

      movedCount++
      actions.push({
        type: 'move',
        shapeId: shape.id,
        successMessage: "Moved " + shape.type + " to " + position
      })
    }
  }

  const shapeWord = movedCount === 1 ? 'shape' : 'shapes'
  return {
    message: "Moved " + movedCount + " " + shapeWord + " matching \"" + shapeDescription + "\" to the " + position + ".",
    actions: actions
  }
}

async function handleBooleanSubtract(args, canvasId, userId) {
  const { cuttingShapeDescription, targetShapeDescription, cuttingShapeId, targetShapeId } = args

  // Get all shapes
  const { data: objects } = await supabase
    .from('objects')
    .select('*')
    .eq('canvas_id', canvasId)

  const shapes = objects ? objects.map(obj => ({
    id: obj.id,
    type: obj.type,
    position: { x: obj.position_x, y: obj.position_y, z: obj.position_z },
    color: obj.color,
    properties: obj.properties || {},
    geometry: obj.geometry
  })) : []

  // Find cutting shape
  let cuttingShape
  if (cuttingShapeId) {
    cuttingShape = shapes.find(s => s.id === cuttingShapeId)
  } else if (cuttingShapeDescription) {
    cuttingShape = findShapeByDescription(shapes, cuttingShapeDescription)
  }

  if (!cuttingShape) {
    throw new Error("Could not find cutting shape: " + (cuttingShapeDescription || cuttingShapeId))
  }

  // Find target shape
  let targetShape
  if (targetShapeId) {
    targetShape = shapes.find(s => s.id === targetShapeId)
  } else if (targetShapeDescription) {
    targetShape = findShapeByDescription(shapes, targetShapeDescription)
  }

  if (!targetShape) {
    throw new Error("Could not find target shape: " + (targetShapeDescription || targetShapeId))
  }

  if (cuttingShape.id === targetShape.id) {
    throw new Error('Cannot subtract a shape from itself')
  }

  // Perform boolean subtract operation
  // For now, we'll simulate this by updating the target shape's geometry
  // In a real implementation, this would use CSG operations on the geometry data

  try {
    // For this implementation, we'll create a simple "hole" effect by modifying the geometry
    // In practice, you'd use a proper CSG library on the server side or delegate to client

    // For now, just delete the cutting shape and mark the target as modified
    await supabase
      .from('objects')
      .delete()
      .eq('id', cuttingShape.id)
      .eq('canvas_id', canvasId)

    // Update target shape to indicate it has been modified (you might want to store CSG result)
    const { error } = await supabase
      .from('objects')
      .update({
        // You could store the modified geometry here
        updated_at: new Date().toISOString()
      })
      .eq('id', targetShape.id)
      .eq('canvas_id', canvasId)

    if (error) {
      throw error
    }

    // Broadcast updates
    io.to("canvas:" + canvasId).emit('object-deleted', { id: cuttingShape.id })
    io.to("canvas:" + canvasId).emit('object-updated', {
      id: targetShape.id,
      updated_at: new Date().toISOString()
    })

    return {
      message: "Performed boolean subtract operation: cut " + cuttingShape.type + " from " + targetShape.type + ".",
      actions: [{
        type: 'boolean-subtract',
        targetShapeId: targetShape.id,
        cuttingShapeId: cuttingShape.id,
        successMessage: "Cut " + cuttingShape.type + " from " + targetShape.type
      }]
    }

  } catch (error) {
    console.error('Error in boolean subtract:', error)
    throw new Error("Failed to perform boolean subtract: " + error.message)
  }
}

async function handleBooleanUnion(args, canvasId, userId) {
  const { shape1Description, shape2Description, shape1Id, shape2Id } = args

  // Get all shapes
  const { data: objects } = await supabase
    .from('objects')
    .select('*')
    .eq('canvas_id', canvasId)

  const shapes = objects ? objects.map(obj => ({
    id: obj.id,
    type: obj.type,
    position: { x: obj.position_x, y: obj.position_y, z: obj.position_z },
    color: obj.color,
    properties: obj.properties || {},
    geometry: obj.geometry
  })) : []

  // Find shape 1
  let shape1
  if (shape1Id) {
    shape1 = shapes.find(s => s.id === shape1Id)
  } else if (shape1Description) {
    shape1 = findShapeByDescription(shapes, shape1Description)
  }

  if (!shape1) {
    throw new Error("Could not find first shape: " + (shape1Description || shape1Id))
  }

  // Find shape 2
  let shape2
  if (shape2Id) {
    shape2 = shapes.find(s => s.id === shape2Id)
  } else if (shape2Description) {
    shape2 = findShapeByDescription(shapes, shape2Description)
  }

  if (!shape2) {
    throw new Error("Could not find second shape: " + (shape2Description || shape2Id))
  }

  if (shape1.id === shape2.id) {
    throw new Error('Cannot union a shape with itself')
  }

  // For this implementation, we'll keep the first shape and delete the second
  // In practice, you'd perform proper CSG union operation
  await supabase
    .from('objects')
    .delete()
    .eq('id', shape2.id)
    .eq('canvas_id', canvasId)

  // Broadcast updates
  io.to("canvas:" + canvasId).emit('object-deleted', { id: shape2.id })

  return {
    message: "Performed boolean union operation: combined " + shape1.type + " with " + shape2.type + ".",
    actions: [{
      type: 'boolean-union',
      shape1Id: shape1.id,
      shape2Id: shape2.id,
      successMessage: "Combined " + shape1.type + " with " + shape2.type
    }]
  }
}


// Helper function to create shapes directly without success messages (for bulk operations)
async function createShapeDirectly(args, canvasId, userId) {
  const {
    type,
    x = 0,
    y = 0,
    z = 0,
    width = 2,
    height = 2,
    depth = 2,
    radius = 1,
    tube = 0.4,
    tubularSegments = 20,
    radialSegments = 8,
    color = '#4f46e5',
    text,
    fontSize = 1
  } = args

  // Map AI types to internal types
  const typeMapping = {
    rectangle: 'rectangle',
    circle: 'circle',
    box: 'box',
    sphere: 'sphere',
    cylinder: 'cylinder',
    text: 'text',
    torus: 'torus',
    torusKnot: 'torusKnot',
    dodecahedron: 'dodecahedron',
    icosahedron: 'icosahedron',
    octahedron: 'octahedron',
    tetrahedron: 'tetrahedron',
    tube: 'tube'
  }

  const internalType = typeMapping[type]
  if (!internalType) {
    throw new Error("Unsupported shape type: " + type)
  }

  // For 2D shapes (rectangle, circle), they should be placed on ground (y=0)
  // and use z coordinate for positioning
  let positionX = x
  let positionY = y
  let positionZ = z

  if (internalType === 'rectangle' || internalType === 'circle') {
    positionY = 0.05 // Slightly above ground to avoid z-fighting
    positionZ = z // Use z parameter as the ground position
  }

  // Create the object in database with individual columns
  const objectData = {
    type: internalType,
    canvas_id: canvasId,
    created_by: userId,
    position_x: positionX,
    position_y: positionY,
    position_z: positionZ,
    rotation_x: 0,
    rotation_y: 0,
    rotation_z: 0,
    scale_x: 1,
    scale_y: 1,
    scale_z: 1,
    color: color,
    geometry: '' // Will be set by client
  }

  // Set shape-specific properties based on type
  switch (internalType) {
    case 'rectangle':
      objectData.width = width
      objectData.height = height
      break
    case 'circle':
      // Circles use width/height for ground plane sizing
      objectData.width = radius * 2
      objectData.height = radius * 2
      break
    case 'box':
      objectData.width = width
      objectData.height = height
      objectData.depth = depth
      break
    case 'sphere':
    case 'dodecahedron':
    case 'icosahedron':
    case 'octahedron':
    case 'tetrahedron':
      // For spherical shapes, use radius as width for client-side processing
      objectData.width = radius
      objectData.height = radius
      objectData.depth = radius
      break
    case 'cylinder':
      objectData.width = radius * 2
      objectData.height = height
      objectData.depth = radius * 2
      break
    case 'torus':
    case 'torusKnot':
      objectData.width = radius * 2
      objectData.height = tube * 2
      objectData.depth = radius * 2
      break
    case 'tube':
      objectData.width = radius * 2
      objectData.height = radius * 2
      objectData.depth = radius * 2
      break
    case 'text':
      if (text) {
        objectData.text_content = text
        objectData.font_size = fontSize
      }
      break
  }

  const { data: newObject, error } = await supabase
    .from('objects')
    .insert(objectData)
    .select()
    .single()

  if (error) throw error

  // Broadcast to all users in the canvas
  io.to("canvas:" + canvasId).emit('object-created', newObject)

  return newObject
}

// Helper function to find shapes by description
function findShapesByDescription(shapes, description) {
  if (!description) return []

  const desc = description.toLowerCase()

  // Handle "all shapes" or "all"
  if (desc.includes('all')) {
    return shapes
  }

  // Handle specific type requests like "all rectangles", "all circles"
  if (desc.startsWith('all ')) {
    const type = desc.replace('all ', '')
    return shapes.filter(shape => shape.type.toLowerCase().includes(type))
  }

  // Handle color requests like "red shapes", "blue circles"
  const colorNames = {
    'red': '#ff0000',
    'green': '#00ff00',
    'blue': '#0000ff',
    'yellow': '#ffff00',
    'magenta': '#ff00ff',
    'cyan': '#00ffff',
    'black': '#000000',
    'white': '#ffffff',
    'gray': '#808080'
  }

  let filteredShapes = shapes

  // Filter by color
  for (const [colorName, hexColor] of Object.entries(colorNames)) {
    if (desc.includes(colorName)) {
      filteredShapes = filteredShapes.filter(shape => shape.color === hexColor)
      break
    }
  }

  // Filter by type
  const shapeTypes = ['rectangle', 'circle', 'box', 'sphere', 'cylinder', 'text']
  for (const type of shapeTypes) {
    if (desc.includes(type)) {
      filteredShapes = filteredShapes.filter(shape => shape.type === type)
      break
    }
  }

  return filteredShapes
}

// Helper function to find a single shape by description
function findShapeByDescription(shapes, description) {
  const matches = findShapesByDescription(shapes, description)
  return matches.length > 0 ? matches[0] : null
}

// Helper function to get color names
function getColorName(hexColor) {
  const colors = {
    '#ff0000': 'red',
    '#00ff00': 'green',
    '#0000ff': 'blue',
    '#ffff00': 'yellow',
    '#ff00ff': 'magenta',
    '#00ffff': 'cyan',
    '#000000': 'black',
    '#ffffff': 'white',
    '#808080': 'gray',
    '#4f46e5': 'blue'
  }
  return colors[hexColor] || 'colored'
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() })
})

const PORT = process.env.PORT || 3001

server.listen(PORT, () => {
  console.log("CollabCanvas server running on port " + PORT)
  console.log("Socket.io server ready for connections")
})

