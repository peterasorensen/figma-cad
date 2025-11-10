# Quick Start: Room Detection

## What Changed

✅ **Completely replaced** the broken GPT-4V approach with proper computer vision
✅ **New Python microservice** using OpenCV for accurate geometric analysis
✅ **Running and tested** - service is healthy on port 5001

## Start the System (3 Terminals)

### Terminal 1: Python Vision Service
```bash
cd python-vision-service
source venv/bin/activate
python app.py
```

### Terminal 2: Node.js Server
```bash
cd server
npm run dev
```

### Terminal 3: Client
```bash
cd client
npm run dev
```

## Quick Test

```bash
# Verify Python service is healthy
curl http://localhost:5001/health

# Expected output:
# {"status": "healthy", "service": "blueprint-vision"}
```

## How to Use

1. Open client in browser
2. Click "Import Blueprint" button
3. Upload a floor plan image (PNG/JPG/PDF)
4. Wait 2-5 seconds for detection
5. Review detected rooms
6. Import to canvas

## Why It's Better

### Before (GPT-4V):
- ❌ Random rectangles everywhere
- ❌ No geometric accuracy
- ❌ Hallucinated coordinates
- ❌ Wrong tool for the job

### Now (OpenCV):
- ✅ Accurate wall detection (Hough transform)
- ✅ Precise contour analysis
- ✅ Real geometric measurements
- ✅ Proper computer vision techniques

## Tuning Detection

If rooms aren't detected well, edit `python-vision-service/app.py`:

```python
# Adjust these parameters:
min_area=1000        # Min room size (increase if too many small regions)
threshold=100        # Line sensitivity (lower = more lines detected)
minLineLength=50     # Min wall length
maxLineGap=10        # Max gap in walls
```

## Full Documentation

See `SETUP_BLUEPRINT_DETECTION.md` for complete details, troubleshooting, and advanced configuration.

## Status

🟢 **Python Vision Service:** Running on port 5001
🟢 **Node.js Server:** Ready to accept requests
🟢 **Client:** Can upload and import blueprints

## Recent Improvements (v2)

✅ **Smart room merging** - Automatically detects and merges rooms split by noise
✅ **Better preprocessing** - Morphological closing to connect broken walls
✅ **Improved scoring** - Uses solidity + extent metrics for better quality
✅ **Lower min_area default** - Now 800 (was 1000) to catch more rooms
✅ **Inverted detection** - Detects white spaces (rooms) instead of black (walls)

## Tuning If Needed

**Missing rooms?** Lower `min_area`:
```bash
# In Node.js server call (or edit python-vision-service/app.py line 355)
options: { min_area: 500 }
```

**Rooms still splitting?** Increase closing kernel (edit `app.py` line 60):
```python
kernel_close = np.ones((7, 7), np.uint8)  # Increase from (5,5)
```

**See `python-vision-service/TUNING_GUIDE.md` for complete tuning reference.**

**Next:** Test with actual blueprint images to fine-tune detection parameters.
