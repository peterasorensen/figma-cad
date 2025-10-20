-- Migration to add text_content and font_size columns to objects table
-- Run this if your database doesn't have these columns yet

-- Add text_content column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'objects'
                   AND column_name = 'text_content') THEN
        ALTER TABLE objects ADD COLUMN text_content TEXT;
    END IF;
END $$;

-- Add font_size column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'objects'
                   AND column_name = 'font_size') THEN
        ALTER TABLE objects ADD COLUMN font_size REAL DEFAULT 16;
    END IF;
END $$;

-- Add scale columns for text objects if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'objects'
                   AND column_name = 'scale_x') THEN
        ALTER TABLE objects ADD COLUMN scale_x REAL DEFAULT 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'objects'
                   AND column_name = 'scale_y') THEN
        ALTER TABLE objects ADD COLUMN scale_y REAL DEFAULT 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'objects'
                   AND column_name = 'scale_z') THEN
        ALTER TABLE objects ADD COLUMN scale_z REAL DEFAULT 1;
    END IF;
END $$;
