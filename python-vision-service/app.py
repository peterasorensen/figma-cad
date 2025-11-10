"""
Blueprint Room Detection Microservice
Uses OpenCV for computer vision-based room boundary detection
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import cv2
import numpy as np
from PIL import Image
import io
import requests
import logging

app = Flask(__name__)
CORS(app)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def download_image(url):
    """Download image from URL"""
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        image = Image.open(io.BytesIO(response.content))
        return cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
    except Exception as e:
        logger.error(f"Failed to download image: {e}")
        raise


def preprocess_blueprint(image):
    """
    Preprocess blueprint image for better room detection
    - Convert to grayscale
    - Apply adaptive thresholding
    - Denoise
    """
    # Convert to grayscale
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    # Apply bilateral filter to reduce noise while preserving edges
    denoised = cv2.bilateralFilter(gray, 9, 75, 75)

    # Apply adaptive thresholding to handle varying lighting
    binary = cv2.adaptiveThreshold(
        denoised,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        11,
        2
    )

    return gray, binary


def detect_walls(binary_image):
    """
    Detect wall lines using Hough Line Transform
    Returns horizontal and vertical lines
    """
    # Apply morphological operations to connect broken lines
    kernel = np.ones((3, 3), np.uint8)
    dilated = cv2.dilate(binary_image, kernel, iterations=1)

    # Detect lines using Hough Line Transform
    lines = cv2.HoughLinesP(
        dilated,
        rho=1,
        theta=np.pi/180,
        threshold=100,
        minLineLength=50,
        maxLineGap=10
    )

    horizontal_lines = []
    vertical_lines = []

    if lines is not None:
        for line in lines:
            x1, y1, x2, y2 = line[0]

            # Calculate angle
            angle = np.abs(np.arctan2(y2 - y1, x2 - x1) * 180 / np.pi)

            # Classify as horizontal or vertical (with tolerance)
            if angle < 10 or angle > 170:  # Horizontal
                horizontal_lines.append((x1, y1, x2, y2))
            elif 80 < angle < 100:  # Vertical
                vertical_lines.append((x1, y1, x2, y2))

    logger.info(f"Detected {len(horizontal_lines)} horizontal and {len(vertical_lines)} vertical wall lines")
    return horizontal_lines, vertical_lines


def find_rooms_from_contours(binary_image, min_area=1000, max_area=None):
    """
    Find rooms by detecting contours (enclosed spaces)
    Returns bounding boxes for each detected room
    """
    # Find contours
    contours, hierarchy = cv2.findContours(
        binary_image,
        cv2.RETR_TREE,
        cv2.CHAIN_APPROX_SIMPLE
    )

    if max_area is None:
        # Set max area to 1/4 of the image area by default
        max_area = (binary_image.shape[0] * binary_image.shape[1]) // 4

    rooms = []
    image_height, image_width = binary_image.shape

    for i, contour in enumerate(contours):
        # Calculate area
        area = cv2.contourArea(contour)

        # Filter by area (ignore too small or too large contours)
        if area < min_area or area > max_area:
            continue

        # Get bounding rectangle
        x, y, w, h = cv2.boundingRect(contour)

        # Filter out extremely thin rectangles (likely walls, not rooms)
        aspect_ratio = max(w, h) / min(w, h) if min(w, h) > 0 else 0
        if aspect_ratio > 10:
            continue

        # Calculate confidence based on how rectangular the contour is
        perimeter = cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, 0.04 * perimeter, True)

        # Confidence: closer to 4 corners = more rectangular = higher confidence
        confidence = min(1.0, max(0.5, 1.0 - abs(len(approx) - 4) * 0.1))

        # Normalize coordinates to 0-1000 scale
        x_min = int((x / image_width) * 1000)
        y_min = int((y / image_height) * 1000)
        x_max = int(((x + w) / image_width) * 1000)
        y_max = int(((y + h) / image_height) * 1000)

        rooms.append({
            'bounding_box': [x_min, y_min, x_max, y_max],
            'confidence': round(confidence, 2),
            'area': int(area),
            'corners': len(approx)
        })

    logger.info(f"Found {len(rooms)} potential rooms from contours")
    return rooms


def filter_and_rank_rooms(rooms, max_rooms=20):
    """
    Filter overlapping rooms and rank by confidence and area
    """
    if not rooms:
        return []

    # Sort by confidence and area
    sorted_rooms = sorted(
        rooms,
        key=lambda r: (r['confidence'], r['area']),
        reverse=True
    )

    # Remove heavily overlapping rooms (keep higher confidence ones)
    filtered_rooms = []
    for room in sorted_rooms:
        is_overlapping = False
        x1, y1, x2, y2 = room['bounding_box']

        for existing in filtered_rooms:
            ex1, ey1, ex2, ey2 = existing['bounding_box']

            # Calculate intersection
            inter_x1 = max(x1, ex1)
            inter_y1 = max(y1, ey1)
            inter_x2 = min(x2, ex2)
            inter_y2 = min(y2, ey2)

            if inter_x1 < inter_x2 and inter_y1 < inter_y2:
                inter_area = (inter_x2 - inter_x1) * (inter_y2 - inter_y1)
                room_area = (x2 - x1) * (y2 - y1)

                # If overlap is more than 70%, consider it duplicate
                if inter_area / room_area > 0.7:
                    is_overlapping = True
                    break

        if not is_overlapping:
            filtered_rooms.append(room)

        if len(filtered_rooms) >= max_rooms:
            break

    logger.info(f"Filtered to {len(filtered_rooms)} non-overlapping rooms")
    return filtered_rooms


def detect_rooms(image_url, options=None):
    """
    Main room detection pipeline
    """
    if options is None:
        options = {}

    min_area = options.get('min_area', 1000)
    max_rooms = options.get('max_rooms', 20)

    # Download image
    logger.info(f"Downloading blueprint from: {image_url}")
    image = download_image(image_url)

    # Preprocess
    logger.info("Preprocessing blueprint...")
    gray, binary = preprocess_blueprint(image)

    # Detect walls (for future enhancement - can be used to refine room detection)
    logger.info("Detecting wall lines...")
    horizontal_lines, vertical_lines = detect_walls(binary)

    # Find rooms from contours
    logger.info("Finding rooms from contours...")
    rooms = find_rooms_from_contours(binary, min_area=min_area)

    # Filter and rank
    logger.info("Filtering and ranking rooms...")
    filtered_rooms = filter_and_rank_rooms(rooms, max_rooms=max_rooms)

    # Format output to match expected API response
    result_rooms = []
    for i, room in enumerate(filtered_rooms):
        result_rooms.append({
            'id': f'room_{str(i + 1).zfill(3)}',
            'bounding_box': room['bounding_box'],
            'name_hint': f'Room {i + 1}',  # Basic naming - can be enhanced with OCR
            'confidence': room['confidence']
        })

    logger.info(f"Detection complete: {len(result_rooms)} rooms")
    return result_rooms


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({'status': 'healthy', 'service': 'blueprint-vision'})


@app.route('/detect-rooms', methods=['POST'])
def detect_rooms_endpoint():
    """
    Detect rooms from blueprint image

    Request body:
    {
        "blueprintUrl": "https://...",
        "options": {
            "min_area": 1000,
            "max_rooms": 20
        }
    }

    Response:
    {
        "rooms": [
            {
                "id": "room_001",
                "bounding_box": [x_min, y_min, x_max, y_max],
                "name_hint": "Room 1",
                "confidence": 0.85
            }
        ]
    }
    """
    try:
        data = request.get_json()

        if not data or 'blueprintUrl' not in data:
            return jsonify({'error': 'blueprintUrl is required'}), 400

        blueprint_url = data['blueprintUrl']
        options = data.get('options', {})

        # Detect rooms
        rooms = detect_rooms(blueprint_url, options)

        return jsonify({
            'rooms': rooms,
            'count': len(rooms)
        })

    except Exception as e:
        logger.error(f"Error detecting rooms: {str(e)}", exc_info=True)
        return jsonify({
            'error': str(e),
            'message': 'Failed to detect rooms from blueprint'
        }), 500


if __name__ == '__main__':
    port = 5001  # Changed from 5000 to avoid conflict with macOS AirPlay Receiver
    logger.info(f"Starting Blueprint Vision Service on port {port}...")
    app.run(host='0.0.0.0', port=port, debug=True)
