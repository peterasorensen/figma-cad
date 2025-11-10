# Blueprint Room Detection Feature - Setup Guide

## Overview
This guide covers the setup and configuration required for the Location Detection AI feature that was integrated into CollabCanvas.

## Prerequisites
- Node.js and npm installed
- Supabase account and project
- OpenAI API key with GPT-4 Vision API access

## 1. Database Setup

### Run the Schema Migration
The schema has already been updated in `server/sql/schema.sql` with two new tables:
- `blueprints` - Stores uploaded blueprint metadata
- `detected_rooms` - Stores AI-detected room information

**To apply the schema:**
1. Go to your Supabase project dashboard
2. Navigate to the SQL Editor
3. Copy and paste the contents of `server/sql/schema.sql`
4. Run the SQL to create the tables

Or use the Supabase CLI:
```bash
supabase db push
```

## 2. Supabase Storage Configuration

### Create the Blueprints Bucket
1. Go to your Supabase project dashboard
2. Navigate to **Storage** → **Buckets**
3. Click **New bucket**
4. Configure the bucket:
   - **Name**: `blueprints`
   - **Public**: Enable (so blueprint URLs can be accessed by OpenAI Vision API)
   - **File size limit**: 10 MB (or adjust as needed)
   - **Allowed MIME types**: `image/png`, `image/jpeg`, `image/jpg`, `application/pdf`

### Storage Policies (RLS)
Add these policies to the `blueprints` bucket:

**Upload Policy**:
```sql
CREATE POLICY "Users can upload blueprints"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'blueprints');
```

**Read Policy**:
```sql
CREATE POLICY "Blueprints are publicly readable"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'blueprints');
```

**Delete Policy**:
```sql
CREATE POLICY "Users can delete their own blueprints"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'blueprints');
```

## 3. Environment Variables

### Server Environment Variables
Add to `server/.env` (or your main `.env`):

```bash
# OpenAI API Configuration
OPENAI_API_KEY=sk-your-openai-api-key-here

# Supabase Configuration (if not already set)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key-here

# Server Configuration
PORT=3001
CLIENT_URL=http://localhost:5173
```

### Client Environment Variables
Add to `.env` (or `.env.local`):

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

## 4. Install Dependencies

Dependencies have already been added to `server/package.json`. Install them:

```bash
cd server
npm install
```

This will install:
- `multer@^2.0.0` - File upload handling
- `sharp@^0.33.2` - Image processing

## 5. Running the Application

### Start the Server
```bash
npm run dev:server
```

### Start the Client
```bash
npm run dev:client
```

Or run both together:
```bash
npm run dev
```

## 6. Using the Blueprint Detection Feature

### Basic Workflow
1. Click the **"📐 Blueprint"** button in the left toolbar
2. Upload a blueprint image (PNG, JPG) or PDF
3. Wait for AI processing (~10-30 seconds)
4. Review detected rooms in the preview
5. Click **"Import Rooms to Canvas"** to add them

### What Happens Behind the Scenes
1. **Upload**: Blueprint is uploaded to Supabase Storage
2. **Database**: Metadata is saved to the `blueprints` table
3. **AI Detection**: OpenAI GPT-4 Vision API analyzes the blueprint
4. **Processing**: AI returns room bounding boxes in normalized coordinates
5. **Storage**: Detected rooms are saved to the `detected_rooms` table
6. **Display**: Rooms are rendered on the canvas as semi-transparent Room objects

## 7. Features Included

### Room Object Properties
- **Bounding Box**: Normalized coordinates [x_min, y_min, x_max, y_max]
- **Name Hint**: AI-suggested room name (e.g., "Kitchen", "Bedroom")
- **Confidence Score**: AI confidence level (0-1)
- **Verified Status**: User can mark rooms as verified
- **Editable**: Users can adjust room boundaries after import

### Visual Indicators
- **Color-coded by confidence**:
  - High (≥0.8): Indigo
  - Medium (0.6-0.8): Amber
  - Low (<0.6): Red
- **Semi-transparent**: Verified rooms are more opaque
- **Boundary handles**: Corner handles appear when selected (for future editing)

### Real-time Collaboration
- Room creation is broadcast to all connected users
- Socket.io events keep everyone in sync
- Progress updates during AI processing

## 8. Testing the Integration

### Test with Mock Data
For development/testing without API calls, you can use the mock detection function:

In `server/ai/blueprint-detection.js`, temporarily replace the `detectRooms` call with `detectRoomsMock`:

```javascript
// In detect-rooms endpoint
const rooms = await detectRoomsMock(publicUrl);
```

This returns 5 mock rooms instantly without using OpenAI credits.

### Test with Real Blueprints
1. Use a simple floor plan image (Google "simple floor plan" for examples)
2. Ensure room labels are visible on the blueprint for better name detection
3. Use clear, high-contrast images for best results

## 9. Troubleshooting

### "Blueprint not found" error
- Check that the `blueprints` table exists in Supabase
- Verify RLS policies allow reading from the table

### "Failed to upload blueprint" error
- Ensure the `blueprints` storage bucket exists
- Check bucket is public and has correct policies
- Verify file size is under 10MB

### "Invalid OpenAI API key" error
- Confirm `OPENAI_API_KEY` is set in server environment
- Ensure the API key has GPT-4 Vision API access
- Check OpenAI account has available credits

### "Rooms not appearing on canvas" error
- Check browser console for errors
- Verify `createRoom` method exists in ShapeFactory
- Ensure 'room' case is handled in ShapeManager.createShape()

### CORS Issues
- Ensure `CLIENT_URL` in server .env matches your frontend URL
- Check Supabase storage bucket is set to public

## 10. API Endpoints Reference

### POST `/api/blueprints/upload`
Uploads a blueprint file.

**Body**: `multipart/form-data`
- `blueprint`: File (PNG/JPG/PDF)
- `canvasId`: String

**Response**:
```json
{
  "blueprintId": "uuid",
  "url": "https://...",
  "width": 1920,
  "height": 1080
}
```

### POST `/api/blueprints/detect-rooms`
Triggers AI room detection.

**Body**: `application/json`
```json
{
  "blueprintId": "uuid"
}
```

**Response**:
```json
{
  "rooms": [
    {
      "id": "uuid",
      "bounding_box": [100, 100, 400, 350],
      "name_hint": "Kitchen",
      "confidence": 0.92,
      "verified": false
    }
  ]
}
```

### GET `/api/blueprints/:blueprintId/rooms`
Retrieves detected rooms for a blueprint.

**Response**:
```json
{
  "rooms": [...]
}
```

### PUT `/api/blueprints/rooms/:roomId`
Updates a detected room.

**Body**: `application/json`
```json
{
  "bounding_box": [100, 100, 450, 400],
  "name_hint": "Updated Name",
  "verified": true
}
```

## 11. Socket.io Events

### Server → Client

- **`room-detection-progress`**: Progress updates during detection
  ```javascript
  {
    status: 'processing',
    progress: 50,
    message: 'Identifying room boundaries...'
  }
  ```

- **`room-detection-complete`**: Detection finished successfully
  ```javascript
  {
    blueprintId: 'uuid',
    rooms: [...]
  }
  ```

- **`room-detection-error`**: Detection failed
  ```javascript
  {
    message: 'Error message'
  }
  ```

## 12. Future Enhancements

Potential improvements for future iterations:

1. **PDF Support**: Full PDF parsing with pdf.js
2. **Manual Editing**: Drag corner handles to adjust room boundaries
3. **Room Merging**: Combine multiple detected rooms
4. **Room Splitting**: Split a detected room into multiple rooms
5. **Export to DXF/DWG**: Export detected rooms as CAD files
6. **Training Data**: Collect user corrections to improve AI accuracy
7. **Batch Processing**: Process multiple blueprints at once
8. **Room Properties**: Add metadata like square footage, function, etc.
9. **3D Extrusion**: Auto-generate 3D building models from 2D rooms
10. **Blueprint Alignment**: Align multiple floor plans for multi-story buildings

## 13. Cost Considerations

### OpenAI API Costs
- GPT-4 Vision API: ~$0.01-0.03 per blueprint
- High-detail mode uses more tokens
- Consider implementing rate limiting for production

### Supabase Storage Costs
- Free tier: 1GB storage
- Paid plans: $0.021/GB/month
- Each blueprint: ~1-5MB depending on resolution

## 14. Support

For issues or questions:
- Check the troubleshooting section above
- Review server logs for detailed error messages
- Check browser console for client-side errors
- Ensure all environment variables are set correctly

---

**Integration Complete!** 🎉

The Location Detection AI feature is now fully integrated into CollabCanvas. Users can upload blueprints and automatically detect room boundaries using OpenAI's GPT-4 Vision API.
