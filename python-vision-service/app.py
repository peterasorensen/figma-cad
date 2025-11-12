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
import pytesseract

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
    - Close door gaps to create enclosed rooms
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

    # AGGRESSIVE morphological closing to connect door gaps
    # This is critical for blueprints with open doors

    # First, close small gaps with a small kernel
    kernel_small = np.ones((3, 3), np.uint8)
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel_small, iterations=3)

    # Then use directional kernels to close doors (VERY aggressive)
    # Increased kernel sizes and iterations to handle larger door gaps
    kernel_vertical = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 15))  # Much taller for door gaps
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel_vertical, iterations=3)

    kernel_horizontal = cv2.getStructuringElement(cv2.MORPH_RECT, (15, 1))  # Much wider for door gaps
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel_horizontal, iterations=3)

    # Medium pass to connect diagonal connections
    kernel_medium = np.ones((7, 7), np.uint8)
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel_medium, iterations=2)

    # Larger pass to handle very broken walls
    kernel_large = np.ones((9, 9), np.uint8)
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel_large, iterations=2)

    # Remove small noise that might have been created
    kernel_open = np.ones((3, 3), np.uint8)
    binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel_open, iterations=1)

    logger.info("Preprocessing complete - aggressive door gap closing applied")
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


def extend_lines_for_open_plans(binary_image, horizontal_lines, vertical_lines, max_gap=50, max_extension=80):
    """
    Intelligently extend wall lines to help subdivide open floor plans
    Only extends lines that are nearly aligned and close to each other

    Args:
        binary_image: Binary image to draw extended lines on
        horizontal_lines: List of horizontal lines (x1, y1, x2, y2)
        vertical_lines: List of vertical lines (x1, y1, x2, y2)
        max_gap: Maximum gap between lines to consider extending (pixels)
        max_extension: Maximum distance to extend a line (pixels)

    Returns:
        Enhanced binary image with extended lines
    """
    enhanced = binary_image.copy()
    h, w = binary_image.shape
    extensions_made = 0

    # Process horizontal lines - extend lines that are nearly aligned horizontally
    for i, line1 in enumerate(horizontal_lines):
        x1_1, y1_1, x2_1, y2_1 = line1
        # Ensure left-to-right ordering
        if x1_1 > x2_1:
            x1_1, x2_1 = x2_1, x1_1
            y1_1, y2_1 = y2_1, y1_1

        avg_y1 = (y1_1 + y2_1) // 2

        # Look for nearby horizontal lines that could be connected
        for j, line2 in enumerate(horizontal_lines[i+1:], start=i+1):
            x1_2, y1_2, x2_2, y2_2 = line2
            if x1_2 > x2_2:
                x1_2, x2_2 = x2_2, x1_2
                y1_2, y2_2 = y2_2, y1_2

            avg_y2 = (y1_2 + y2_2) // 2

            # Check if lines are roughly aligned (same horizontal position, within 15px)
            if abs(avg_y1 - avg_y2) < 15:
                # Check gap between line endings
                if x1_2 > x2_1:  # line2 is to the right of line1
                    gap = x1_2 - x2_1
                    if 0 < gap < max_gap:
                        # Extend to connect them, but limit extension
                        extension_length = min(gap, max_extension)
                        cv2.line(enhanced, (x2_1, avg_y1), (x2_1 + extension_length, avg_y2), 255, 2)
                        extensions_made += 1

    # Process vertical lines - extend lines that are nearly aligned vertically
    for i, line1 in enumerate(vertical_lines):
        x1_1, y1_1, x2_1, y2_1 = line1
        # Ensure top-to-bottom ordering
        if y1_1 > y2_1:
            x1_1, x2_1 = x2_1, x1_1
            y1_1, y2_1 = y2_1, y1_1

        avg_x1 = (x1_1 + x2_1) // 2

        # Look for nearby vertical lines that could be connected
        for j, line2 in enumerate(vertical_lines[i+1:], start=i+1):
            x1_2, y1_2, x2_2, y2_2 = line2
            if y1_2 > y2_2:
                x1_2, x2_2 = x2_2, x1_2
                y1_2, y2_2 = y2_2, y1_2

            avg_x2 = (x1_2 + x2_2) // 2

            # Check if lines are roughly aligned (same vertical position, within 15px)
            if abs(avg_x1 - avg_x2) < 15:
                # Check gap between line endings
                if y1_2 > y2_1:  # line2 is below line1
                    gap = y1_2 - y2_1
                    if 0 < gap < max_gap:
                        # Extend to connect them, but limit extension
                        extension_length = min(gap, max_extension)
                        cv2.line(enhanced, (avg_x1, y2_1), (avg_x2, y2_1 + extension_length), 255, 2)
                        extensions_made += 1

    logger.info(f"Extended {extensions_made} wall lines to help subdivide open floor plans")
    return enhanced


def find_rooms_from_contours(binary_image, min_area=300, max_area=None):
    """
    Find rooms by detecting contours (enclosed spaces)
    Uses hierarchy to filter out parent contours
    """
    # Find contours with hierarchy
    contours, hierarchy = cv2.findContours(
        binary_image,
        cv2.RETR_TREE,
        cv2.CHAIN_APPROX_SIMPLE
    )

    if max_area is None:
        # Set max area to 1/2 of the image area
        max_area = (binary_image.shape[0] * binary_image.shape[1]) // 2

    # hierarchy[0][i] = [Next, Previous, First_Child, Parent]
    # We want to filter out contours that have children (parent contours)
    # These are often false detections that encompass multiple rooms

    rooms = []
    hallways = []
    image_height, image_width = binary_image.shape

    logger.info(f"Total contours found: {len(contours)}")

    for i, contour in enumerate(contours):
        # Calculate area
        area = cv2.contourArea(contour)

        # Area filter
        if area < min_area or area > max_area:
            continue

        # Get bounding rectangle
        x, y, w, h = cv2.boundingRect(contour)

        # Calculate aspect ratio
        aspect_ratio = max(w, h) / min(w, h) if min(w, h) > 0 else 0

        # Check if this contour has children (is a parent)
        # hierarchy[0][i][2] is the first child index (-1 means no children)
        has_children = hierarchy[0][i][2] != -1 if hierarchy is not None else False

        # Filter out parent contours (building outline, overlapping regions)
        if has_children:
            # Count how many children
            child_count = 0
            child_idx = hierarchy[0][i][2]
            while child_idx != -1:
                child_count += 1
                child_idx = hierarchy[0][child_idx][0]  # Next sibling

            # Calculate total area of all children
            child_total_area = 0
            child_idx = hierarchy[0][i][2]
            while child_idx != -1 and child_idx < len(contours):
                child_total_area += cv2.contourArea(contours[child_idx])
                child_idx = hierarchy[0][child_idx][0]

            child_ratio = child_total_area / area if area > 0 else 0

            # Skip if:
            # 1. Has multiple children (3+) AND is large (5x min) AND children are significant (>40%)
            # 2. OR is HUGE (>25% of image) regardless (catches building outline)
            image_area = image_height * image_width
            area_ratio = area / image_area if image_area > 0 else 0

            should_skip = False
            reason = ""

            if child_count >= 3 and area > min_area * 5 and child_ratio > 0.4:
                should_skip = True
                reason = f"{child_count} children, area ratio: {child_ratio:.2f}"
            elif area_ratio > 0.25:  # More than 25% of entire image
                should_skip = True
                reason = f"huge parent (>{area_ratio:.1%} of image)"

            if should_skip:
                logger.info(f"Skipping parent contour {i} - {reason}")
                continue

        # Detect hallways (long aspect ratio AND reasonable size)
        # Must be at least 3:1 ratio and decent area
        is_hallway = aspect_ratio > 3 and area > min_area * 2

        # Filter aspect ratio for rooms (not hallways)
        if not is_hallway and aspect_ratio > 15:
            continue

        # Calculate confidence
        normalized_area = area / (image_height * image_width)

        # Penalize extremely large rooms (likely false detections like building outline)
        if normalized_area > 0.25:  # More than 25% of image
            confidence = 0.4  # Low confidence for huge rooms
        else:
            confidence = min(0.95, max(0.5, normalized_area * 50))

        # Normalize coordinates to 0-1000 scale
        x_min = int((x / image_width) * 1000)
        y_min = int((y / image_height) * 1000)
        x_max = int(((x + w) / image_width) * 1000)
        y_max = int(((y + h) / image_height) * 1000)

        room_data = {
            'bounding_box': [x_min, y_min, x_max, y_max],
            'confidence': round(confidence, 2),
            'area': int(area),
            'is_hallway': is_hallway,
            'aspect_ratio': round(aspect_ratio, 2)
        }

        if is_hallway:
            hallways.append(room_data)
        else:
            rooms.append(room_data)

    logger.info(f"Found {len(rooms)} rooms and {len(hallways)} hallways after filtering")

    # Combine rooms and hallways
    all_spaces = rooms + hallways
    return all_spaces


def should_merge_rooms(room1, room2, merge_threshold=0.4):
    """
    Determine if two rooms should be merged (likely same room split by noise)
    """
    x1_min, y1_min, x1_max, y1_max = room1['bounding_box']
    x2_min, y2_min, x2_max, y2_max = room2['bounding_box']

    # Calculate intersection
    inter_x1 = max(x1_min, x2_min)
    inter_y1 = max(y1_min, y2_min)
    inter_x2 = min(x1_max, x2_max)
    inter_y2 = min(y1_max, y2_max)

    if inter_x1 >= inter_x2 or inter_y1 >= inter_y2:
        # No intersection, check if they're adjacent
        # Calculate gap between rooms
        gap_x = max(0, max(x1_min, x2_min) - min(x1_max, x2_max))
        gap_y = max(0, max(y1_min, y2_min) - min(y1_max, y2_max))

        # If rooms are very close (gap < 5% of average room size), consider merging
        avg_width = ((x1_max - x1_min) + (x2_max - x2_min)) / 2
        avg_height = ((y1_max - y1_min) + (y2_max - y2_min)) / 2
        threshold_gap = min(avg_width, avg_height) * 0.05

        return gap_x <= threshold_gap and gap_y <= threshold_gap

    # Calculate overlap
    inter_area = (inter_x2 - inter_x1) * (inter_y2 - inter_y1)
    room1_area = (x1_max - x1_min) * (y1_max - y1_min)
    room2_area = (x2_max - x2_min) * (y2_max - y2_min)

    # Merge if overlap is significant (but not complete duplicate)
    overlap_ratio1 = inter_area / room1_area if room1_area > 0 else 0
    overlap_ratio2 = inter_area / room2_area if room2_area > 0 else 0

    # Merge if there's moderate overlap (likely split room)
    return (merge_threshold < overlap_ratio1 < 0.9 or
            merge_threshold < overlap_ratio2 < 0.9)


def merge_rooms(room1, room2):
    """
    Merge two rooms into one by combining their bounding boxes
    """
    x1_min, y1_min, x1_max, y1_max = room1['bounding_box']
    x2_min, y2_min, x2_max, y2_max = room2['bounding_box']

    merged = {
        'bounding_box': [
            min(x1_min, x2_min),
            min(y1_min, y2_min),
            max(x1_max, x2_max),
            max(y1_max, y2_max)
        ],
        'confidence': max(room1['confidence'], room2['confidence']),  # Take higher confidence
        'area': room1['area'] + room2['area'],
        'corners': min(room1['corners'], room2['corners']),  # More rectangular (fewer corners)
        'solidity': max(room1.get('solidity', 0.8), room2.get('solidity', 0.8)),
        'extent': max(room1.get('extent', 0.8), room2.get('extent', 0.8))
    }

    return merged


def filter_and_rank_rooms(rooms, max_rooms=30, min_confidence=0.8):
    """
    Filter duplicates and overlapping rooms
    NO OVERLAPS ALLOWED - remove any room that overlaps significantly with another
    Also filters out low-confidence detections
    """
    if not rooms:
        return []

    logger.info(f"Before filtering: {len(rooms)} rooms")

    # First, filter by confidence threshold (80%)
    confident_rooms = [r for r in rooms if r.get('confidence', 0) >= min_confidence]
    logger.info(f"After confidence filter (>={min_confidence}): {len(confident_rooms)} rooms")

    # Second, filter out huge rooms (>25% of image area in normalized coordinates)
    # Max normalized area is 1000*1000 = 1,000,000, so 25% = 250,000
    MAX_ROOM_AREA = 250000  # 25% of total image in normalized coordinates
    size_filtered_rooms = []
    for room in confident_rooms:
        x1, y1, x2, y2 = room['bounding_box']
        room_area = (x2 - x1) * (y2 - y1)
        if room_area > MAX_ROOM_AREA:
            logger.info(f"Filtering out huge room: area={room_area} ({room_area/10000:.1f}% of image)")
            continue
        size_filtered_rooms.append(room)
    logger.info(f"After size filter: {len(size_filtered_rooms)} rooms")

    # Sort by area (larger first) - prefer keeping larger rooms
    sorted_rooms = sorted(size_filtered_rooms, key=lambda r: r['area'], reverse=True)

    # Remove duplicates AND significant overlaps
    filtered_rooms = []
    for room in sorted_rooms:
        has_overlap = False
        x1, y1, x2, y2 = room['bounding_box']
        room_area = (x2 - x1) * (y2 - y1)

        if room_area == 0:
            continue

        for existing in filtered_rooms:
            ex1, ey1, ex2, ey2 = existing['bounding_box']
            existing_area = (ex2 - ex1) * (ey2 - ey1)

            # Calculate intersection
            inter_x1 = max(x1, ex1)
            inter_y1 = max(y1, ey1)
            inter_x2 = min(x2, ex2)
            inter_y2 = min(y2, ey2)

            if inter_x1 < inter_x2 and inter_y1 < inter_y2:
                inter_area = (inter_x2 - inter_x1) * (inter_y2 - inter_y1)

                # Calculate overlap ratio for both rooms
                overlap_ratio_this = inter_area / room_area
                overlap_ratio_existing = inter_area / existing_area if existing_area > 0 else 0

                # Remove if EITHER room has >5% overlap
                # This prevents overlapping rooms completely
                if overlap_ratio_this > 0.05 or overlap_ratio_existing > 0.05:
                    has_overlap = True
                    logger.info(f"Removing overlapping room (overlap: {overlap_ratio_this:.1%} / {overlap_ratio_existing:.1%})")
                    break

        if not has_overlap:
            filtered_rooms.append(room)

        if len(filtered_rooms) >= max_rooms:
            break

    logger.info(f"After filtering: {len(filtered_rooms)} rooms (removed overlaps)")
    return filtered_rooms


def preprocess_for_ocr(image):
    """
    Preprocess image for OCR while preserving text readability
    Uses gentler preprocessing than room detection pipeline
    """
    # Convert to grayscale
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    # Apply mild denoising to reduce noise but preserve text
    denoised = cv2.bilateralFilter(gray, 5, 50, 50)

    # Enhance contrast for better text recognition
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
    enhanced = clahe.apply(denoised)

    # Apply mild thresholding to create binary image for OCR
    binary = cv2.adaptiveThreshold(
        enhanced,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        11,
        2
    )

    return gray, binary


def detect_text_regions(image):
    """
    Detect text regions in the blueprint using pytesseract
    Returns list of text detections with bounding boxes and confidence
    """
    try:
        # Preprocess image for OCR
        gray, binary = preprocess_for_ocr(image)

        # Get image dimensions for coordinate normalization
        height, width = image.shape[:2]

        # Configure tesseract for better blueprint text recognition
        custom_config = r'--oem 3 --psm 11 -c tessedit_char_whitelist=0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz '

        # Get detailed OCR data including bounding boxes and confidence
        data = pytesseract.image_to_data(binary, config=custom_config, output_type=pytesseract.Output.DICT)

        text_regions = []

        # Process each detected text region
        for i, text in enumerate(data['text']):
            # Skip empty text or very low confidence
            if not text.strip() or data['conf'][i] < 30:
                continue

            # Get bounding box coordinates
            x, y, w, h = data['left'][i], data['top'][i], data['width'][i], data['height'][i]

            # Skip very small text regions (likely noise)
            if w < 10 or h < 10:
                continue

            # Normalize coordinates to 0-1000 scale to match room coordinates
            x_min = int((x / width) * 1000)
            y_min = int((y / height) * 1000)
            x_max = int(((x + w) / width) * 1000)
            y_max = int(((y + h) / height) * 1000)

            text_regions.append({
                'text': text.strip(),
                'bounding_box': [x_min, y_min, x_max, y_max],
                'confidence': data['conf'][i],
                'center_x': (x_min + x_max) // 2,
                'center_y': (y_min + y_max) // 2
            })

        logger.info(f"Detected {len(text_regions)} text regions via OCR")
        return text_regions

    except Exception as e:
        logger.error(f"OCR failed: {e}")
        return []


def associate_text_with_rooms(rooms, text_regions, max_distance=150):
    """
    Associate detected text with room boundaries using spatial proximity
    """
    if not text_regions:
        return rooms

    # Sort text regions by confidence (highest first)
    sorted_text = sorted(text_regions, key=lambda x: x['confidence'], reverse=True)

    # Create a copy of rooms to modify
    rooms_with_text = []

    for room in rooms:
        room_copy = room.copy()
        room_center_x = (room['bounding_box'][0] + room['bounding_box'][2]) // 2
        room_center_y = (room['bounding_box'][1] + room['bounding_box'][3]) // 2

        # Find closest text that hasn't been used yet
        best_text = None
        best_distance = float('inf')
        best_text_idx = -1

        for i, text_region in enumerate(sorted_text):
            text_center_x = text_region['center_x']
            text_center_y = text_region['center_y']

            # Calculate Euclidean distance
            distance = ((text_center_x - room_center_x) ** 2 + (text_center_y - room_center_y) ** 2) ** 0.5

            # Check if text is within the room boundaries (with some tolerance)
            room_x1, room_y1, room_x2, room_y2 = room['bounding_box']
            text_in_room = (text_region['bounding_box'][0] >= room_x1 - 50 and
                          text_region['bounding_box'][1] >= room_y1 - 50 and
                          text_region['bounding_box'][2] <= room_x2 + 50 and
                          text_region['bounding_box'][3] <= room_y2 + 50)

            # Prefer text inside room, but allow nearby text if within distance limit
            if (text_in_room or distance <= max_distance) and distance < best_distance:
                best_distance = distance
                best_text = text_region
                best_text_idx = i

        if best_text:
            # Use the detected text as room name
            room_copy['detected_name'] = best_text['text']
            room_copy['text_confidence'] = best_text['confidence']
            # Remove this text from available list
            sorted_text.pop(best_text_idx)
        else:
            room_copy['detected_name'] = None
            room_copy['text_confidence'] = 0

        rooms_with_text.append(room_copy)

    return rooms_with_text


def detect_rooms(image_url, options=None):
    """
    Main room detection pipeline

    Tunable parameters:
    - min_area: Minimum room area in pixels (default: 800, lower = catch smaller rooms)
    - max_rooms: Maximum rooms to return (default: 20)
    - merge_threshold: Threshold for merging adjacent rooms (default: 0.4, lower = more aggressive merging)
    """
    if options is None:
        options = {}

    min_area = options.get('min_area', 200)  # Even lower to catch all rooms
    max_rooms = options.get('max_rooms', 20)
    merge_threshold = options.get('merge_threshold', 0.4)

    # Download image
    logger.info(f"Downloading blueprint from: {image_url}")
    image = download_image(image_url)

    # Preprocess
    logger.info("Preprocessing blueprint...")
    gray, binary = preprocess_blueprint(image)

    # Detect walls
    logger.info("Detecting wall lines...")
    horizontal_lines, vertical_lines = detect_walls(binary)

    # Extend lines for open floor plans (helps subdivide open spaces)
    logger.info("Extending lines to subdivide open floor plans...")
    enhanced_binary = extend_lines_for_open_plans(binary, horizontal_lines, vertical_lines)

    # Find rooms from contours (using enhanced binary with extended lines)
    logger.info("Finding rooms from contours...")
    rooms = find_rooms_from_contours(enhanced_binary, min_area=min_area)

    # Filter and rank (pass merge_threshold to filtering)
    logger.info("Filtering and ranking rooms...")
    # Update filter_and_rank_rooms to use merge_threshold
    filtered_rooms = filter_and_rank_rooms(rooms, max_rooms=max_rooms)

    # OCR: Detect text regions and associate with rooms
    logger.info("Detecting text labels via OCR...")
    text_regions = detect_text_regions(image)
    rooms_with_text = associate_text_with_rooms(filtered_rooms, text_regions)

    # Format output to match expected API response
    result_rooms = []
    room_count = 0
    hallway_count = 0

    for room in rooms_with_text:
        is_hallway = room.get('is_hallway', False)

        # Use detected name from OCR if available and confident enough
        detected_name = room.get('detected_name')
        text_confidence = room.get('text_confidence', 0)

        if is_hallway:
            hallway_count += 1
            # Use detected name for hallways too if available
            if detected_name and text_confidence > 60:
                name_hint = detected_name
                room_id = f'hallway_{detected_name.lower().replace(" ", "_")}_{str(hallway_count).zfill(2)}'
            else:
                name_hint = f'Hallway {hallway_count}'
                room_id = f'hallway_{str(hallway_count).zfill(3)}'
        else:
            room_count += 1
            # Use detected name if OCR found it with good confidence
            if detected_name and text_confidence > 60:
                name_hint = detected_name
                room_id = f'room_{detected_name.lower().replace(" ", "_")}_{str(room_count).zfill(2)}'
            else:
                name_hint = f'Room {room_count}'
                room_id = f'room_{str(room_count).zfill(3)}'

        room_result = {
            'id': room_id,
            'bounding_box': room['bounding_box'],
            'name_hint': name_hint,
            'confidence': room['confidence']
        }

        # Include OCR info if detected
        if detected_name:
            room_result['detected_name'] = detected_name
            room_result['text_confidence'] = text_confidence

        result_rooms.append(room_result)

    logger.info(f"Detection complete: {len(result_rooms)} rooms")
    return result_rooms


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({'status': 'healthy', 'service': 'blueprint-vision'})


@app.route('/detect-rooms', methods=['POST'])
def detect_rooms_endpoint():
    """
    Detect rooms from blueprint image with OCR text recognition

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
                "name_hint": "Kitchen",
                "confidence": 0.85,
                "detected_name": "Kitchen",
                "text_confidence": 78.5
            }
        ],
        "count": 1
    }

    OCR Features:
    - Automatically detects room labels from blueprint text
    - Associates text with detected room boundaries
    - Falls back to generic names ("Room 1", "Room 2") when OCR fails
    - Includes OCR confidence scores for quality assessment
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
