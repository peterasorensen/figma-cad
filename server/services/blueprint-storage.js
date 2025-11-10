/**
 * Blueprint Storage Service
 * Handles uploading, storing, and managing blueprint files
 */

import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

/**
 * Validates blueprint file type
 * @param {string} mimetype - File mimetype
 * @returns {boolean} - Whether file type is valid
 */
export function validateBlueprintFile(mimetype) {
  const validTypes = [
    'image/png',
    'image/jpeg',
    'image/jpg',
    'application/pdf'
  ];
  return validTypes.includes(mimetype);
}

/**
 * Uploads blueprint file to Supabase Storage
 * @param {Buffer} fileBuffer - File buffer
 * @param {string} filename - Original filename
 * @param {string} canvasId - Canvas ID
 * @param {string} mimetype - File mimetype
 * @returns {Promise<Object>} - Upload result with file URL and metadata
 */
export async function uploadBlueprint(fileBuffer, filename, canvasId, mimetype) {
  try {
    // Validate file type
    if (!validateBlueprintFile(mimetype)) {
      throw new Error('Invalid file type. Only PNG, JPG, and PDF files are allowed.');
    }

    // Generate unique filename
    const timestamp = Date.now();
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = `${canvasId}/${timestamp}_${sanitizedFilename}`;

    let processedBuffer = fileBuffer;
    let width = null;
    let height = null;

    // For images (not PDFs), process with sharp to get dimensions and optimize
    if (mimetype.startsWith('image/')) {
      const image = sharp(fileBuffer);
      const metadata = await image.metadata();

      width = metadata.width;
      height = metadata.height;

      // Optimize image (max 4096x4096 to keep reasonable size)
      const MAX_DIMENSION = 4096;
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        processedBuffer = await image
          .resize(MAX_DIMENSION, MAX_DIMENSION, {
            fit: 'inside',
            withoutEnlargement: true
          })
          .toBuffer();

        // Recalculate dimensions after resize
        const resizedMetadata = await sharp(processedBuffer).metadata();
        width = resizedMetadata.width;
        height = resizedMetadata.height;
      }
    }

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('blueprints')
      .upload(storagePath, processedBuffer, {
        contentType: mimetype,
        upsert: false
      });

    if (uploadError) {
      throw uploadError;
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('blueprints')
      .getPublicUrl(storagePath);

    return {
      path: uploadData.path,
      url: publicUrl,
      width,
      height,
      fileType: mimetype.split('/')[1]
    };
  } catch (error) {
    console.error('Blueprint upload error:', error);
    throw error;
  }
}

/**
 * Deletes blueprint file from storage
 * @param {string} filePath - Storage file path
 * @returns {Promise<void>}
 */
export async function deleteBlueprintFile(filePath) {
  try {
    const { error } = await supabase.storage
      .from('blueprints')
      .remove([filePath]);

    if (error) {
      throw error;
    }
  } catch (error) {
    console.error('Blueprint deletion error:', error);
    throw error;
  }
}

/**
 * Gets blueprint file URL from storage
 * @param {string} filePath - Storage file path
 * @returns {string} - Public URL
 */
export function getBlueprintUrl(filePath) {
  const { data: { publicUrl } } = supabase.storage
    .from('blueprints')
    .getPublicUrl(filePath);

  return publicUrl;
}

/**
 * Creates a thumbnail for the blueprint
 * @param {Buffer} fileBuffer - Original file buffer
 * @param {string} mimetype - File mimetype
 * @returns {Promise<Buffer>} - Thumbnail buffer
 */
export async function createBlueprintThumbnail(fileBuffer, mimetype) {
  if (!mimetype.startsWith('image/')) {
    throw new Error('Thumbnail generation only supported for images');
  }

  return await sharp(fileBuffer)
    .resize(400, 400, {
      fit: 'inside',
      withoutEnlargement: true
    })
    .jpeg({ quality: 80 })
    .toBuffer();
}
