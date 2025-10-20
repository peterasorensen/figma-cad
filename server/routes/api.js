import { supabase } from '../core/database.js'

export function setupApiRoutes(app) {
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
}
