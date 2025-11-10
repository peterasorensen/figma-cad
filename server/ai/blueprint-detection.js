/**
 * Blueprint Room Detection Service
 * Uses Python OpenCV microservice for computer vision-based room detection
 */

import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

// Python vision service URL (port 5001 to avoid conflict with macOS AirPlay on 5000)
const VISION_SERVICE_URL = process.env.VISION_SERVICE_URL || 'http://localhost:5001';

/**
 * Detects rooms in a blueprint using OpenCV-based computer vision
 * @param {string} blueprintUrl - Public URL of the blueprint image
 * @param {Object} options - Detection options
 * @returns {Promise<Array>} - Array of detected rooms with bounding boxes
 */
export async function detectRooms(blueprintUrl, options = {}) {
  try {
    const {
      minArea = 1000,
      maxRooms = 20,
      minConfidence = 0.5
    } = options;

    console.log(`🔍 Detecting rooms from blueprint: ${blueprintUrl}`);

    // Call Python vision service
    const response = await fetch(`${VISION_SERVICE_URL}/detect-rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        blueprintUrl,
        options: {
          min_area: minArea,
          max_rooms: maxRooms
        }
      }),
      timeout: 30000 // 30 second timeout
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Vision service error: ${response.status}`);
    }

    const data = await response.json();
    const rooms = data.rooms || [];

    // Filter by minimum confidence if provided
    const validRooms = rooms
      .filter(room => {
        // Validate required fields
        if (!room.bounding_box || !Array.isArray(room.bounding_box) || room.bounding_box.length !== 4) {
          console.warn('Invalid room bounding_box:', room);
          return false;
        }

        // Validate coordinates are within bounds
        const [x_min, y_min, x_max, y_max] = room.bounding_box;
        if (x_min < 0 || y_min < 0 || x_max > 1000 || y_max > 1000 || x_min >= x_max || y_min >= y_max) {
          console.warn('Invalid room coordinates:', room);
          return false;
        }

        // Filter by minimum confidence
        if (room.confidence && room.confidence < minConfidence) {
          return false;
        }

        return true;
      });

    console.log(`✅ Detected ${validRooms.length} valid rooms from blueprint`);
    return validRooms;

  } catch (error) {
    console.error('❌ Room detection error:', error);

    // Provide more specific error messages
    if (error.message.includes('ECONNREFUSED')) {
      throw new Error('Vision service unavailable. Please ensure the Python service is running on port 5000.');
    } else if (error.message.includes('timeout')) {
      throw new Error('Room detection timed out. The blueprint may be too large or complex.');
    } else if (error.message.includes('Failed to download')) {
      throw new Error('Failed to download blueprint image. Check the URL is accessible.');
    }

    throw error;
  }
}

/**
 * Detects rooms with progress callback for real-time updates
 * @param {string} blueprintUrl - Public URL of the blueprint image
 * @param {Function} progressCallback - Callback for progress updates
 * @param {Object} options - Detection options
 * @returns {Promise<Array>} - Array of detected rooms
 */
export async function detectRoomsWithProgress(blueprintUrl, progressCallback, options = {}) {
  try {
    // Report initial progress
    progressCallback({ status: 'starting', progress: 0, message: 'Initializing computer vision analysis...' });

    // Simulate progress updates
    progressCallback({ status: 'processing', progress: 25, message: 'Detecting walls and boundaries...' });

    // Start detection
    const startTime = Date.now();

    progressCallback({ status: 'processing', progress: 50, message: 'Finding enclosed spaces (rooms)...' });

    // Perform actual detection
    const rooms = await detectRooms(blueprintUrl, options);

    const elapsed = Date.now() - startTime;
    console.log(`Room detection completed in ${elapsed}ms`);

    progressCallback({
      status: 'processing',
      progress: 75,
      message: `Found ${rooms.length} rooms. Finalizing...`
    });

    // Small delay to show final progress
    await new Promise(resolve => setTimeout(resolve, 500));

    progressCallback({
      status: 'complete',
      progress: 100,
      message: `Successfully detected ${rooms.length} rooms!`
    });

    return rooms;

  } catch (error) {
    progressCallback({
      status: 'error',
      progress: 0,
      message: error.message || 'Failed to detect rooms'
    });
    throw error;
  }
}

/**
 * Validates detected rooms and provides quality feedback
 * @param {Array} rooms - Array of detected rooms
 * @returns {Object} - Validation result with statistics
 */
export function validateDetectedRooms(rooms) {
  const stats = {
    total: rooms.length,
    highConfidence: rooms.filter(r => r.confidence >= 0.8).length,
    mediumConfidence: rooms.filter(r => r.confidence >= 0.5 && r.confidence < 0.8).length,
    lowConfidence: rooms.filter(r => r.confidence < 0.5).length,
    named: rooms.filter(r => r.name_hint && r.name_hint !== 'Unknown Room').length,
    unnamed: rooms.filter(r => !r.name_hint || r.name_hint === 'Unknown Room').length,
    averageConfidence: rooms.reduce((sum, r) => sum + r.confidence, 0) / rooms.length || 0
  };

  return {
    valid: rooms.length > 0,
    stats,
    recommendations: generateRecommendations(stats)
  };
}

function generateRecommendations(stats) {
  const recommendations = [];

  if (stats.lowConfidence > stats.total * 0.3) {
    recommendations.push('Many rooms have low confidence. Consider using a higher resolution blueprint.');
  }

  if (stats.unnamed > stats.total * 0.5) {
    recommendations.push('Many rooms lack name hints. Ensure room labels are visible on the blueprint.');
  }

  if (stats.total === 0) {
    recommendations.push('No rooms detected. Ensure the blueprint clearly shows room boundaries and walls.');
  } else if (stats.total < 3) {
    recommendations.push('Few rooms detected. Verify this matches your blueprint or try a clearer image.');
  }

  return recommendations;
}

// Mock detection for development/testing without API calls
export async function detectRoomsMock(blueprintUrl) {
  console.log('Using mock room detection (no API call)');

  // Simulate processing delay
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Return mock rooms
  return [
    {
      id: 'room_001',
      bounding_box: [100, 100, 400, 350],
      name_hint: 'Entry Hall',
      confidence: 0.92
    },
    {
      id: 'room_002',
      bounding_box: [420, 100, 850, 450],
      name_hint: 'Main Office',
      confidence: 0.95
    },
    {
      id: 'room_003',
      bounding_box: [100, 370, 400, 650],
      name_hint: 'Storage Room',
      confidence: 0.88
    },
    {
      id: 'room_004',
      bounding_box: [420, 470, 650, 650],
      name_hint: 'Conference Room',
      confidence: 0.90
    },
    {
      id: 'room_005',
      bounding_box: [670, 470, 850, 650],
      name_hint: 'Kitchen',
      confidence: 0.85
    }
  ];
}
