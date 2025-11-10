# Blueprint Vision Service

Python microservice for detecting room boundaries from architectural blueprints using OpenCV computer vision.

## Overview

This service uses proper computer vision techniques (not LLMs) to detect rooms:
- **Line Detection**: Hough transform to identify wall lines
- **Contour Analysis**: Finds enclosed spaces (rooms)
- **Bounding Box Extraction**: Returns normalized coordinates for each room

## Installation

### Option 1: Local Python Environment

```bash
cd python-vision-service

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run the service
python app.py
```

The service will start on `http://localhost:5000`

### Option 2: Docker (Recommended for Production)

```bash
docker build -t blueprint-vision .
docker run -p 5000:5000 blueprint-vision
```

## API Endpoints

### Health Check
```bash
GET /health
```

Response:
```json
{
  "status": "healthy",
  "service": "blueprint-vision"
}
```

### Detect Rooms
```bash
POST /detect-rooms
Content-Type: application/json

{
  "blueprintUrl": "https://example.com/blueprint.png",
  "options": {
    "min_area": 1000,
    "max_rooms": 20
  }
}
```

Response:
```json
{
  "rooms": [
    {
      "id": "room_001",
      "bounding_box": [100, 100, 400, 350],
      "name_hint": "Room 1",
      "confidence": 0.92
    }
  ],
  "count": 1
}
```

## How It Works

1. **Image Download**: Fetches blueprint from provided URL
2. **Preprocessing**:
   - Convert to grayscale
   - Bilateral filtering (noise reduction)
   - Adaptive thresholding
3. **Wall Detection**: Hough line transform to find horizontal/vertical lines
4. **Contour Detection**: Finds enclosed spaces using `cv2.findContours()`
5. **Filtering**:
   - Remove contours that are too small/large
   - Remove thin rectangles (likely walls)
   - Remove overlapping duplicates
6. **Ranking**: Sort by confidence and area
7. **Normalization**: Convert coordinates to 0-1000 scale

## Configuration

Options you can pass in the request:

- `min_area` (default: 1000): Minimum contour area in pixels
- `max_rooms` (default: 20): Maximum number of rooms to return

## Testing

Test with a blueprint URL:

```bash
curl -X POST http://localhost:5000/detect-rooms \
  -H "Content-Type: application/json" \
  -d '{
    "blueprintUrl": "https://example.com/floor-plan.png",
    "options": {
      "min_area": 500,
      "max_rooms": 15
    }
  }'
```

## Future Enhancements

- [ ] OCR for room labels/numbers (using Tesseract)
- [ ] Better wall line reconstruction
- [ ] Support for curved/angled rooms
- [ ] Multi-floor blueprint support
- [ ] Room type classification (kitchen, bedroom, etc.)

## Troubleshooting

**Service won't start:**
- Make sure Python 3.8+ is installed
- Check that port 5000 is not in use
- Verify all dependencies installed correctly

**Poor detection results:**
- Adjust `min_area` based on blueprint resolution
- Try preprocessing the blueprint (higher contrast, cleaner scan)
- Check that the blueprint has clear wall boundaries

**Out of memory:**
- Large blueprints can be memory-intensive
- Consider downscaling images before processing
- Increase system resources or use Docker with memory limits
