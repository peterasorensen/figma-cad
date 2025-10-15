# CollabCanvas

## Building Real-Time Collaborative Design Tools with AI

---

## Background

Figma revolutionized design by making collaboration seamless. Multiple designers could work together in real time, seeing each other’s cursors and making edits simultaneously without merge conflicts.

This required solving complex technical challenges: real-time synchronization, conflict resolution, and 60 FPS performance while streaming data across the network.

Now imagine adding AI to this. What if you could tell an AI agent “create a login form” and watch it build the components on your canvas? Or say “arrange these elements in a grid” and see it happen automatically?

This project challenges you to build both the collaborative infrastructure and an AI agent that can manipulate the canvas through natural language.

### Why This Matters

The future of design tools isn’t just collaborative — it’s co-creative. You’ll be building the foundation for how humans and AI can design together, in real time.

You’ll build in two phases: first the core collaborative canvas with real-time sync, then an AI agent that manipulates the canvas through natural language.

### MVP Requirements (24 Hours)

This is a hard gate. To pass the MVP checkpoint, you must have:

- [ ]  Basic canvas with pan/zoom  
- [ ]  At least one shape type (rectangle, circle, or text)  
- [ ]  Ability to create and move objects  
- [ ]  Real-time sync between 2+ users  
- [ ]  Multiplayer cursors with name labels  
- [ ]  Presence awareness (who’s online)  
- [ ]  User authentication (users have accounts/names)  
- [ ]  Deployed and publicly accessible

The focus is on collaborative infrastructure.

The MVP isn’t about features — it’s about proving your foundation is solid. A simple canvas with bulletproof multiplayer is worth more than a feature-rich canvas with broken sync.

### Example Architecture

At minimum, you should have:

1. A backend that broadcasts updates.  
2. A front-end listener that updates local canvas state and rebroadcasts deltas.  
3. A persistence layer that saves the current state on disconnects.

## Core Collaborative Canvas

### Canvas Features

Your canvas needs a large workspace with a smooth pan and zoom. It doesn’t need to be truly infinite, but should feel spacious. Support basic shapes — rectangles, circles, and lines with solid colors. Add text layers with basic formatting.

Users should be able to transform objects (move, resize, rotate). Include selection for single and multiple objects (shift-click or drag-to-select). Add layer management and basic operations like delete and duplicate.

### Real-Time Collaboration 

Every user should see multiplayer cursors with names moving in real time. When someone creates or modifies an object, it appears instantly for everyone. Show clear presence awareness of who’s currently editing.

Handle conflict resolution when multiple users edit simultaneously. (A “last write wins” approach is acceptable, but document your choice.)

Manage disconnects and reconnects without breaking the experience. Canvas state must persist — if all users leave and come back, their work should still be there.

### Testing Scenario

We’ll test with:

1. 2 users editing simultaneously in different browsers.  
2. One user refreshing mid-edit to confirm state persistence.  
3. Multiple shapes being created and moved rapidly to test sync performance.

### Performance Targets

* Maintain 60 FPS during all interactions (pan, zoom, object manipulation).  
* Sync object changes across users in \<100ms and cursor positions in \<50ms.  
* Support 500+ simple objects without FPS drops and 5+ concurrent users without degradation.

### The AI Feature

Just to keep in mind for the future. Make sure to define a tool schema that a future AI agent can call, such as:

```ts
createShape(type, x, y, width, height, color)
moveShape(shapeId, x, y)
resizeShape(shapeId, width, height)
rotateShape(shapeId, degrees)
createText(text, x, y, fontSize, color)
getCanvasState() // returns current canvas objects for context
```

#### Technical Stack

* Backend: Supabase + Socket.io  
* Frontend: Vanilla Three.js

## Build Strategy

### Start with the Hard Part

Multiplayer sync is the hardest and most important part.  
Get two cursors syncing → objects syncing → handle conflicts → persist state.  
Only after this is solid should you add shapes, transformations, and AI.

### Build Vertically

Finish one layer at a time:

1. Cursor sync  
2. Object sync  
3. Transformations  
4. Basic AI commands  
5. Complex AI commands
