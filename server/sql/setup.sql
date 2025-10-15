-- Setup script for CollabCanvas database
-- Run this after creating your Supabase project

-- First, run the schema.sql file (the main schema above)
-- Then run this setup script to create initial data

-- Create a default canvas for testing
INSERT INTO canvases (name, created_by) VALUES ('Default Canvas', auth.uid());

-- Optional: Create some sample objects for testing
-- Uncomment these lines if you want sample data

-- INSERT INTO objects (canvas_id, type, position_x, position_y, color, width, height, created_by)
-- SELECT
--   c.id,
--   'rectangle',
--   100,
--   100,
--   '#ff6b6b',
--   150,
--   100,
--   c.created_by
-- FROM canvases c WHERE c.name = 'Default Canvas' LIMIT 1;

-- INSERT INTO objects (canvas_id, type, position_x, position_y, color, width, height, created_by)
-- SELECT
--   c.id,
--   'circle',
--   300,
--   200,
--   '#4ecdc4',
--   80,
--   80,
--   c.created_by
-- FROM canvases c WHERE c.name = 'Default Canvas' LIMIT 1;

