-- CollabCanvas Database Schema

-- Enable Row Level Security (RLS)
-- This ensures users can only access their own data

-- Users table (extends Supabase auth.users)
-- The auth.users table is automatically created by Supabase Auth

-- Canvases table - represents collaborative workspaces
CREATE TABLE IF NOT EXISTS canvases (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Untitled Canvas',
  created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Objects table - represents shapes/objects in the canvas
CREATE TABLE IF NOT EXISTS objects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  canvas_id UUID REFERENCES canvases(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'rectangle', 'circle', 'box', 'sphere', 'cylinder', 'text'
  position_x REAL NOT NULL DEFAULT 0,
  position_y REAL NOT NULL DEFAULT 0,
  position_z REAL NOT NULL DEFAULT 0,
  rotation_x REAL NOT NULL DEFAULT 0,
  rotation_y REAL NOT NULL DEFAULT 0,
  rotation_z REAL NOT NULL DEFAULT 0,
  scale_x REAL NOT NULL DEFAULT 1,
  scale_y REAL NOT NULL DEFAULT 1,
  scale_z REAL NOT NULL DEFAULT 1,
  color TEXT DEFAULT '#ffffff',
  text_content TEXT, -- for text objects
  font_size REAL DEFAULT 16, -- for text objects
  width REAL DEFAULT 100,
  height REAL DEFAULT 100,
  depth REAL DEFAULT 100, -- for 3D objects
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Sessions table - for presence tracking
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  canvas_id UUID REFERENCES canvases(id) ON DELETE CASCADE,
  user_email TEXT,
  cursor_x REAL DEFAULT 0,
  cursor_y REAL DEFAULT 0,
  cursor_z REAL DEFAULT 0,
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, canvas_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_objects_canvas_id ON objects(canvas_id);
CREATE INDEX IF NOT EXISTS idx_objects_created_by ON objects(created_by);
CREATE INDEX IF NOT EXISTS idx_user_sessions_canvas_id ON user_sessions(canvas_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);

-- Enable Row Level Security
ALTER TABLE canvases ENABLE ROW LEVEL SECURITY;
ALTER TABLE objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Canvases policies
CREATE POLICY "Users can view canvases they created" ON canvases
  FOR SELECT USING (auth.uid() = created_by);

CREATE POLICY "Users can create canvases" ON canvases
  FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own canvases" ON canvases
  FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own canvases" ON canvases
  FOR DELETE USING (auth.uid() = created_by);

-- Objects policies
CREATE POLICY "Users can view objects in canvases they have access to" ON objects
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM canvases
      WHERE canvases.id = objects.canvas_id
      AND canvases.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can create objects in canvases they have access to" ON objects
  FOR INSERT WITH CHECK (
    auth.uid() = created_by AND
    EXISTS (
      SELECT 1 FROM canvases
      WHERE canvases.id = objects.canvas_id
      AND canvases.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can update objects they created" ON objects
  FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Users can delete objects they created" ON objects
  FOR DELETE USING (auth.uid() = created_by);

-- User sessions policies
CREATE POLICY "Users can view sessions in canvases they have access to" ON user_sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM canvases
      WHERE canvases.id = user_sessions.canvas_id
      AND canvases.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can manage their own sessions" ON user_sessions
  FOR ALL USING (auth.uid() = user_id);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to automatically update updated_at
CREATE TRIGGER update_canvases_updated_at BEFORE UPDATE ON canvases
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_objects_updated_at BEFORE UPDATE ON objects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

