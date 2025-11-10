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

-- Blueprints table - represents uploaded architectural blueprints for room detection
CREATE TABLE IF NOT EXISTS blueprints (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  canvas_id UUID REFERENCES canvases(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL, -- 'png', 'jpg', 'jpeg', 'pdf'
  width INT,
  height INT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Detected Rooms table - represents rooms detected by AI from blueprints
CREATE TABLE IF NOT EXISTS detected_rooms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  blueprint_id UUID REFERENCES blueprints(id) ON DELETE CASCADE,
  bounding_box JSONB NOT NULL, -- [x_min, y_min, x_max, y_max] in 0-1000 normalized coordinates
  polygon JSONB, -- Optional: for non-rectangular rooms [[x1,y1], [x2,y2], ...]
  name_hint TEXT,
  confidence REAL DEFAULT 0, -- AI confidence score (0-1)
  verified BOOLEAN DEFAULT FALSE, -- User has verified/edited this room
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for blueprints and detected_rooms
CREATE INDEX IF NOT EXISTS idx_blueprints_canvas_id ON blueprints(canvas_id);
CREATE INDEX IF NOT EXISTS idx_blueprints_uploaded_by ON blueprints(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_detected_rooms_blueprint_id ON detected_rooms(blueprint_id);

-- Enable Row Level Security for new tables
ALTER TABLE blueprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE detected_rooms ENABLE ROW LEVEL SECURITY;

-- Blueprints policies
CREATE POLICY "Users can view blueprints in their canvases" ON blueprints
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM canvases
      WHERE canvases.id = blueprints.canvas_id
      AND canvases.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can create blueprints in their canvases" ON blueprints
  FOR INSERT WITH CHECK (
    auth.uid() = uploaded_by AND
    EXISTS (
      SELECT 1 FROM canvases
      WHERE canvases.id = blueprints.canvas_id
      AND canvases.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can update blueprints they uploaded" ON blueprints
  FOR UPDATE USING (auth.uid() = uploaded_by);

CREATE POLICY "Users can delete blueprints they uploaded" ON blueprints
  FOR DELETE USING (auth.uid() = uploaded_by);

-- Detected rooms policies
CREATE POLICY "Users can view rooms from blueprints in their canvases" ON detected_rooms
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM blueprints
      JOIN canvases ON canvases.id = blueprints.canvas_id
      WHERE blueprints.id = detected_rooms.blueprint_id
      AND canvases.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can manage rooms from their blueprints" ON detected_rooms
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM blueprints
      JOIN canvases ON canvases.id = blueprints.canvas_id
      WHERE blueprints.id = detected_rooms.blueprint_id
      AND canvases.created_by = auth.uid()
    )
  );

-- Triggers to automatically update updated_at for new tables
CREATE TRIGGER update_blueprints_updated_at BEFORE UPDATE ON blueprints
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_detected_rooms_updated_at BEFORE UPDATE ON detected_rooms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

