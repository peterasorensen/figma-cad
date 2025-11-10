# Room Detection Tuning Guide

## Common Issues & Solutions

### Issue: Missing Some Rooms

**Symptoms:** Some obvious rooms are not detected

**Solutions:**

1. **Lower min_area** (default: 800):
   ```python
   # In your API request
   "options": {
     "min_area": 500  # Try 500-700 for smaller rooms
   }
   ```

2. **Check blueprint quality:**
   - Ensure walls are clearly visible
   - High contrast between rooms and walls
   - Minimal noise/artifacts

3. **Adjust preprocessing** (edit `app.py` line 60-61):
   ```python
   # Increase closing iterations to fill gaps in walls
   kernel_close = np.ones((7, 7), np.uint8)  # Increase from (5,5)
   binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel_close, iterations=3)  # Increase from 2
   ```

### Issue: One Room Split into Multiple

**Symptoms:** A single room appears as 2-3 separate rooms

**Solutions:**

1. **The algorithm now automatically merges split rooms!** New logic detects and merges adjacent/overlapping rooms.

2. **If still splitting, increase closing kernel** (edit `app.py` line 60):
   ```python
   kernel_close = np.ones((7, 7), np.uint8)  # Increase from (5,5)
   ```

3. **Adjust merge threshold** (lower = more aggressive merging):
   ```python
   # In options (when available)
   "options": {
     "merge_threshold": 0.3  # Lower from default 0.4
   }
   ```

### Issue: Too Many Small Regions

**Symptoms:** Detecting lots of tiny spaces that aren't rooms

**Solutions:**

1. **Increase min_area** (default: 800):
   ```python
   "options": {
     "min_area": 1500  # Try 1200-2000
   }
   ```

2. **Filter by dimension** (edit `app.py` line 148):
   ```python
   if w < 30 or h < 30:  # Increase from 20
       continue
   ```

### Issue: Detecting Non-Room Areas

**Symptoms:** Outdoor areas, pathways, or other non-enclosed spaces detected as rooms

**Solutions:**

1. **Increase confidence threshold:**
   - The algorithm already scores rooms by "roomness"
   - Only high-confidence rooms are returned

2. **Adjust aspect ratio filter** (edit `app.py` line 144):
   ```python
   if aspect_ratio > 6:  # More strict (decrease from 8)
       continue
   ```

## Key Parameters

### In API Request (Easy Tuning)

| Parameter | Default | Description | To catch more rooms | To reduce false positives |
|-----------|---------|-------------|---------------------|---------------------------|
| `min_area` | 800 | Min room area (pixels) | Decrease (500-700) | Increase (1200-2000) |
| `max_rooms` | 20 | Max rooms to return | Increase (30-50) | Decrease (10-15) |

Example API request:
```json
{
  "blueprintUrl": "https://...",
  "options": {
    "min_area": 600,
    "max_rooms": 25
  }
}
```

### In app.py (Advanced Tuning)

| Location | Parameter | Default | Purpose |
|----------|-----------|---------|---------|
| Line 60 | `kernel_close` size | (5,5) | Connect broken walls |
| Line 61 | Closing `iterations` | 2 | How aggressively to fill gaps |
| Line 64 | `kernel_open` size | (3,3) | Remove noise |
| Line 144 | `aspect_ratio` threshold | 8 | Filter long thin shapes |
| Line 148 | Min dimension | 20px | Filter tiny artifacts |

## Debugging Tips

### 1. Check Logs

The Python service logs helpful info:
```
Found 15 potential rooms from contours
Merged room 3 and 7 (likely same room split by noise)
After merging: 12 rooms (merged 3 split rooms)
Final: 10 unique rooms
```

### 2. Visualize Detection

Add this to `app.py` after line 373 to save debug images:
```python
# Draw detected contours on image
debug_img = image.copy()
for room in rooms:
    x_min, y_min, x_max, y_max = room['bounding_box']
    # Scale back to image coordinates
    x1 = int((x_min / 1000) * image.shape[1])
    y1 = int((y_min / 1000) * image.shape[0])
    x2 = int((x_max / 1000) * image.shape[1])
    y2 = int((y_max / 1000) * image.shape[0])
    cv2.rectangle(debug_img, (x1, y1), (x2, y2), (0, 255, 0), 2)

cv2.imwrite('/tmp/detected_rooms.png', debug_img)
logger.info("Debug image saved to /tmp/detected_rooms.png")
```

### 3. Test Preprocessing

Check the binary image quality:
```python
# After line 67
cv2.imwrite('/tmp/binary_preprocessed.png', binary)
logger.info("Binary image saved to /tmp/binary_preprocessed.png")
```

Good preprocessing should show:
- ✅ Clear, continuous wall lines
- ✅ White room interiors
- ✅ Black walls
- ❌ No broken/fragmented walls
- ❌ Minimal noise

## Blueprint Quality Requirements

For best results, blueprints should have:

✅ **High resolution** (at least 1000px width)
✅ **Good contrast** (dark walls, light rooms)
✅ **Clear wall boundaries** (not faded or broken)
✅ **Minimal annotations** (less text/symbols cluttering the drawing)
✅ **Professional format** (architectural drawings work best)

❌ **Avoid:**
- Low-resolution scans (<800px)
- Hand-drawn sketches
- Photos of blueprints (use scans)
- Heavy annotations/text overlays
- Faded or poor quality prints

## Performance Tuning

**Slow detection (>10 seconds):**
- Downscale large images before processing
- Reduce `max_rooms` if you don't need many
- Use lower resolution blueprints (1500px is usually enough)

**Out of memory:**
- Reduce image size
- Decrease `max_rooms`
- Process blueprints in batches

## Quick Reference

**To catch MORE rooms:**
```python
min_area = 500          # Lower
kernel_close = (7, 7)   # Larger
iterations = 3          # More
```

**To catch FEWER (more selective):**
```python
min_area = 1500         # Higher
aspect_ratio = 6        # Lower
min_dimension = 30      # Higher
```

**To MERGE split rooms:**
```python
kernel_close = (7, 7)   # Larger
iterations = 3          # More
# (Already auto-merging with new logic!)
```

## Getting Help

1. Check Python service logs for detection details
2. Save debug images to visualize what's being detected
3. Test with different blueprints to isolate issues
4. Adjust one parameter at a time to see effects

## Example Scenarios

### Scenario: Small apartment floor plan (500 sq ft)
```python
"options": {
  "min_area": 400,      # Smaller rooms
  "max_rooms": 8        # Only a few rooms
}
```

### Scenario: Large office building (5000 sq ft)
```python
"options": {
  "min_area": 800,      # Standard room size
  "max_rooms": 30       # Many rooms
}
```

### Scenario: Complex layout with many small rooms
```python
"options": {
  "min_area": 300,      # Catch small closets/bathrooms
  "max_rooms": 40       # Allow many rooms
}
```
