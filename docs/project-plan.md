     Phase 1: Project Foundation & Setup (Steps 1-3)

     1. Initialize project structure - Create package.json, folder structure
      (client, server, shared), and basic configuration files
     2. Set up development environment - Install dependencies (Three.js, 
     Socket.io, Vite for client, Express for server), create dev scripts
     3. Create basic HTML/CSS shell - Minimal index.html with canvas 
     container, basic styling

     Phase 2: Basic Three.js Canvas (Steps 4-7)

     4. Initialize Three.js scene - Set up scene, camera, renderer with 
     proper viewport handling
     5. Implement pan/zoom controls - Add OrbitControls for camera 
     manipulation, constrain to appropriate bounds
     6. Add grid and coordinate system - Visual reference grid, axis helpers
      for 3D orientation
     7. Test: Verify smooth 60 FPS navigation - Performance check with 
     requestAnimationFrame loop

     Phase 3: Basic Shape Creation (Steps 8-11)

     8. Create shape factory system - Abstract shape creation with support 
     for 2D (rectangles, circles) and 3D (boxes, spheres, cylinders)
     9. Implement object creation UI - Simple toolbar/buttons to add shapes 
     to canvas
     10. Add raycasting for object selection - Click detection on 3D objects
     11. Test: Create multiple shapes and select them

     Phase 4: Object Manipulation (Steps 12-15)

     12. Implement TransformControls - Move, rotate, scale for selected 
     objects using Three.js TransformControls
     13. Add keyboard shortcuts - Delete (Del/Backspace), duplicate 
     (Ctrl+D), deselect (Esc)
     14. Multi-select support - Shift+click to select multiple objects
     15. Test: Transform operations on single and multiple objects

     Phase 5: Backend & Database Setup (Steps 16-19)

     16. Set up Supabase project - Create project, configure database schema
      (users, canvases, objects)
     17. Implement authentication - Supabase Auth integration with simple 
     login/signup UI
     18. Create Express server - Basic HTTP server with Socket.io attached
     19. Test: Login and verify database connection

     Phase 6: Real-Time Sync Foundation (Steps 20-24)

     20. Socket.io client-server connection - Establish WebSocket connection
      with room support
     21. Sync cursor positions - Broadcast mouse/pointer positions with user
      info
     22. Render multiplayer cursors - Show other users' cursors as labeled 
     3D markers or sprites
     23. Presence system - Track who's online, broadcast join/leave events
     24. Test: Open 2 browsers, verify cursor sync and presence

     Phase 7: Object State Synchronization (Steps 25-29)

     25. Define shared state schema - JSON schema for objects (id, type, 
     position, rotation, scale, color)
     26. Broadcast object creation - When object created, emit to all 
     clients
     27. Broadcast object updates - Transform changes synced in real-time
     28. Broadcast object deletion - Remove objects across all clients
     29. Test: Create, move, delete objects in 2 browsers simultaneously

     Phase 8: State Persistence (Steps 30-33)

     30. Save canvas state to Supabase - Serialize scene objects to database
      on changes (debounced)
     31. Load canvas state on connect - Fetch and reconstruct scene from 
     database
     32. Handle reconnections - Graceful reconnect with state restoration
     33. Test: Refresh browser mid-edit, verify state persists

     Phase 9: Conflict Resolution & Performance (Steps 34-37)

     34. Implement operational transforms or CRDT - Basic conflict 
     resolution (or last-write-wins with timestamps)
     35. Add optimistic updates - Apply local changes immediately, reconcile
      on conflict
     36. Optimize network traffic - Throttle cursor updates (50ms), batch 
     object updates (100ms)
     37. Test: Rapid simultaneous edits from multiple users

     Phase 10: Layer Management & Advanced Features (Steps 38-41)

     38. Add layer panel UI - List of objects, visibility toggles, 
     reordering
     39. Implement z-index/layer ordering - Change render order of objects
     40. Color picker and properties panel - Edit object colors, dimensions
     41. Test: Complex scene with many objects, verify UI responsiveness

     Phase 11: MVP Polish & Deployment (Steps 42-45)

     42. Add text layers - 3D text geometry with basic formatting options
     43. Performance optimization - Ensure 60 FPS with 500+ objects, 5+ 
     concurrent users
     44. Production build configuration - Environment variables, build 
     scripts
     45. Deploy to hosting - Frontend (Vercel/Netlify) + Backend 
     (Railway/Render)

     Phase 12: 3D-Specific Features (Steps 46-49)

     46. 3D view modes - Toggle between 2D (orthographic top-down) and 3D 
     (perspective) views
     47. Extrude 2D shapes to 3D - Convert rectangles to boxes, circles to 
     cylinders
     48. STL export functionality - Export Three.js geometry to STL file 
     format
     49. Test: Create 3D object, export STL, verify in external viewer

     Phase 13: AI Tool Schema (Steps 50-52)

     50. Define AI tool interface - TypeScript types for createShape, 
     moveShape, etc.
     51. Implement tool execution layer - Execute AI commands, broadcast to 
     all clients
     52. Test: Manually call tools via console, verify behavior

     Future: AI Agent Integration (Post-MVP)

     - Integrate LLM API (Claude/OpenAI)
     - Natural language command parsing
     - Context-aware canvas manipulation

     MVP Gate Requirements Covered:
     ✓ Basic canvas with pan/zoom (Steps 4-7)
     ✓ Multiple shape types (Steps 8-11)
     ✓ Create and move objects (Steps 12-15)
     ✓ Real-time sync between users (Steps 20-29)
     ✓ Multiplayer cursors with labels (Steps 21-23)
     ✓ Presence awareness (Step 23)
     ✓ User authentication (Step 17)
     ✓ Deployed and public (Step 45)
