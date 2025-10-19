-- Migration: Add geometry storage for baked geometry data
-- This migration adds JSONB geometry storage to support non-uniform scaling

-- Add geometry column to store serialized BufferGeometry data
ALTER TABLE objects ADD COLUMN IF NOT EXISTS geometry JSONB;

-- Remove unused text columns (not implemented yet)
ALTER TABLE objects DROP COLUMN IF EXISTS text_content;
ALTER TABLE objects DROP COLUMN IF EXISTS font_size;

-- Keep scale_x/y/z for real-time drag broadcasting
-- Keep width/height/depth for backward compatibility and caching
-- Add comments explaining the new approach:
COMMENT ON COLUMN objects.geometry IS 'Serialized BufferGeometry (positions, normals, etc). Source of truth for shape geometry. Updated on create/delete/resize operations.';
COMMENT ON COLUMN objects.scale_x IS 'Used for real-time broadcasting during resize drag. Reset to 1 after baking.';
COMMENT ON COLUMN objects.scale_y IS 'Used for real-time broadcasting during resize drag. Reset to 1 after baking.';
COMMENT ON COLUMN objects.scale_z IS 'Used for real-time broadcasting during resize drag. Reset to 1 after baking.';
COMMENT ON COLUMN objects.width IS 'Cached dimension for queries. Updated when geometry changes.';
COMMENT ON COLUMN objects.height IS 'Cached dimension for queries. Updated when geometry changes.';
COMMENT ON COLUMN objects.depth IS 'Cached dimension for queries. Updated when geometry changes.';
