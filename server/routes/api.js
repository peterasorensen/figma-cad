import { supabase } from '../core/database.js'
import multer from 'multer'
import { uploadBlueprint, validateBlueprintFile } from '../services/blueprint-storage.js'
import { detectRoomsWithProgress } from '../ai/blueprint-detection.js'

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (validateBlueprintFile(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Invalid file type. Only PNG, JPG, and PDF files are allowed.'))
    }
  }
})

export function setupApiRoutes(app, io) {
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

  // Upload blueprint
  app.post('/api/blueprints/upload', upload.single('blueprint'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' })
      }

      const { canvasId } = req.body
      if (!canvasId) {
        return res.status(400).json({ error: 'Canvas ID is required' })
      }

      // Upload to storage
      const uploadResult = await uploadBlueprint(
        req.file.buffer,
        req.file.originalname,
        canvasId,
        req.file.mimetype
      )

      // Save blueprint metadata to database
      const { data: blueprint, error } = await supabase
        .from('blueprints')
        .insert({
          canvas_id: canvasId,
          file_url: uploadResult.path,
          file_type: uploadResult.fileType,
          width: uploadResult.width,
          height: uploadResult.height
        })
        .select()
        .single()

      if (error) throw error

      res.json({
        blueprintId: blueprint.id,
        url: uploadResult.url,
        width: uploadResult.width,
        height: uploadResult.height
      })

    } catch (error) {
      console.error('Blueprint upload error:', error)
      res.status(500).json({ error: error.message || 'Failed to upload blueprint' })
    }
  })

  // Detect rooms from blueprint
  app.post('/api/blueprints/detect-rooms', async (req, res) => {
    try {
      const { blueprintId } = req.body

      if (!blueprintId) {
        return res.status(400).json({ error: 'Blueprint ID is required' })
      }

      // Get blueprint from database
      const { data: blueprint, error: fetchError } = await supabase
        .from('blueprints')
        .select('*')
        .eq('id', blueprintId)
        .single()

      if (fetchError || !blueprint) {
        return res.status(404).json({ error: 'Blueprint not found' })
      }

      // Get public URL for the blueprint
      const { data: { publicUrl } } = supabase.storage
        .from('blueprints')
        .getPublicUrl(blueprint.file_url)

      // Detect rooms with progress updates via Socket.io
      const rooms = await detectRoomsWithProgress(
        publicUrl,
        (progressData) => {
          // Emit progress to all clients in the canvas room
          if (io) {
            io.to(blueprint.canvas_id).emit('room-detection-progress', progressData)
          }
        }
      )

      // Save detected rooms to database
      const roomInserts = rooms.map(room => ({
        blueprint_id: blueprintId,
        bounding_box: room.bounding_box,
        name_hint: room.name_hint,
        confidence: room.confidence,
        verified: false
      }))

      const { data: savedRooms, error: saveError } = await supabase
        .from('detected_rooms')
        .insert(roomInserts)
        .select()

      if (saveError) throw saveError

      // Emit completion event
      if (io) {
        io.to(blueprint.canvas_id).emit('room-detection-complete', {
          blueprintId,
          rooms: savedRooms
        })
      }

      res.json({ rooms: savedRooms })

    } catch (error) {
      console.error('Room detection error:', error)

      // Emit error event
      if (io && req.body.blueprintId) {
        const { data: blueprint } = await supabase
          .from('blueprints')
          .select('canvas_id')
          .eq('id', req.body.blueprintId)
          .single()

        if (blueprint) {
          io.to(blueprint.canvas_id).emit('room-detection-error', {
            message: error.message || 'Failed to detect rooms'
          })
        }
      }

      res.status(500).json({ error: error.message || 'Failed to detect rooms' })
    }
  })

  // Get detected rooms for a blueprint
  app.get('/api/blueprints/:blueprintId/rooms', async (req, res) => {
    try {
      const { blueprintId } = req.params

      const { data: rooms, error } = await supabase
        .from('detected_rooms')
        .select('*')
        .eq('blueprint_id', blueprintId)
        .order('created_at', { ascending: true })

      if (error) throw error

      res.json({ rooms: rooms || [] })

    } catch (error) {
      console.error('Error fetching rooms:', error)
      res.status(500).json({ error: 'Failed to fetch rooms' })
    }
  })

  // Update detected room
  app.put('/api/blueprints/rooms/:roomId', async (req, res) => {
    try {
      const { roomId } = req.params
      const { bounding_box, name_hint, verified } = req.body

      const updates = {}
      if (bounding_box) updates.bounding_box = bounding_box
      if (name_hint !== undefined) updates.name_hint = name_hint
      if (verified !== undefined) updates.verified = verified

      const { data: room, error } = await supabase
        .from('detected_rooms')
        .update(updates)
        .eq('id', roomId)
        .select()
        .single()

      if (error) throw error

      res.json({ room })

    } catch (error) {
      console.error('Error updating room:', error)
      res.status(500).json({ error: 'Failed to update room' })
    }
  })

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() })
  })
}
