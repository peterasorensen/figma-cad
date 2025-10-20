import { Scene } from './core/render/Scene.js';
import { Controls } from './core/input/Controls.js';
import { Grid } from './core/render/Grid.js';
import { Renderer } from './core/render/Renderer.js';
import { Raycaster } from './core/interaction/Raycaster.js';
import { Transform } from './core/interaction/Transform.js';
import { ShapeManager } from './shapes/ShapeManager.js';
import { AuthModal } from './components/AuthModal.js';
import { auth, supabase } from './core/auth/Auth.js';
import { socketManager } from './core/network/SocketManager.js';
import { CursorManager } from './core/render/CursorManager.js';
import { UIManager } from './core/ui/UIManager.js';
import { SocketEventHandler } from './core/network/SocketEventHandler.js';
import { EventHandler } from './core/input/EventHandler.js';
import { HistoryHelper } from './core/history/HistoryHelper.js';

/**
 * Main application class
 * Orchestrates all components and manages application lifecycle
 */
export class App {
  constructor() {
    // Make auth available as an instance property for helper classes
    this.auth = auth;
    this.socketManager = socketManager;

    this.scene = null;
    this.controls = null;
    this.grid = null;
    this.renderer = null;
    this.raycaster = null;
    this.transform = null;
    this.shapeManager = null;
    this.authModal = null;
    this.cursorManager = null;
    this.uiManager = null;
    this.socketEventHandler = null;
    this.eventHandler = null;
    this.historyHelper = null;
    this.currentCanvasId = null;
    this.currentTool = 'select';
    this.mouseDownPosition = null;
    this.mouseDownTime = 0;
    this.remoteObjects = new Map(); // Track remote objects for sync
    this.remoteCursors = new Map(); // Track remote cursors
    this.lastCursorUpdate = Date.now(); // For throttling cursor updates
    this.lastObjectUpdate = Date.now(); // For throttling object updates
    this.wasAuthenticated = false; // Track previous auth state
    this.onlineUsers = new Set(); // Track online users for presence display
    this.initialStateCaptured = false; // Flag to ensure initial state is only captured once

    this.init();
  }

  async init() {
    try {
      console.log('Initializing CollabCanvas...');

      // Initialize authentication first
      await this.initAuth();

    // Get canvas element
    const canvas = document.getElementById('canvas');
    if (!canvas) {
      console.error('Canvas element not found');
      return;
    }

    // Initialize core components
    this.scene = new Scene(canvas);
    this.controls = new Controls(
      this.scene.getCamera(),
      this.scene.getRenderer().domElement
    );
    this.grid = new Grid(this.scene.getScene());
    this.raycaster = new Raycaster(this.scene.getCamera(), canvas);
    this.shapeManager = new ShapeManager(this.scene.getScene());

    // Initialize helper classes early (needed for auth callbacks)
    this.uiManager = new UIManager(this);
    this.historyHelper = new HistoryHelper(this);

    // Import SnapManager, ObjectControls, and HistoryManager
    const { SnapManager } = await import('./core/interaction/SnapManager.js');
    const { ObjectControls } = await import('./core/ui/ObjectControls.js');
    const { HistoryManager } = await import('./core/history/HistoryManager.js');
    this.snapManager = new SnapManager(this.shapeManager);
    this.transform = new Transform(
      this.scene.getCamera(),
      this.scene.getRenderer().domElement,
      this.controls.controls, // Pass the actual OrbitControls instance
      this.snapManager
    );
    // Provide app reference so Transform can coordinate helpers across shapes
    this.transform.app = this;
    this.objectControls = new ObjectControls(this.scene.getCamera(), this.transform);
    this.historyManager = new HistoryManager();
    this.cursorManager = new CursorManager(this.scene, this.scene.getCamera());

    // Initialize remaining helper classes
    this.socketEventHandler = new SocketEventHandler(this);
    this.eventHandler = new EventHandler(this);

    // Set up transform controls callbacks
    this.transform.setChangeCallback((object) => {
      this.handleObjectTransform(object);
    });

    this.transform.setDragStartCallback((object) => {
      this.historyHelper.beginDragCapture();
    });

    this.transform.setDragEndCallback((object) => {
      this.handleDragEnd(object);
    });

    // Set up text editing event listener
    document.addEventListener('textEdited', (e) => {
      this.handleTextEdited(e.detail);
    });

    // Add transform controls gizmo/helper to scene
    const gizmo = this.transform.getControls().getHelper();
    this.scene.getScene().add(gizmo);

    // Initialize renderer and start animation loop
    this.renderer = new Renderer(this.scene, this.controls);

    // Set up update callback for any per-frame updates
    this.renderer.setUpdateCallback(() => {
      this.update();
    });

    // Start rendering
    this.renderer.start();

    // Initialize undo/redo button states (both disabled initially)
    this.uiManager.updateUndoRedoButtonStates();

    // Initialize socket connection if authenticated (after helper classes are ready)
    if (auth.isAuthenticated) {
      this.initSocket();
      // Create or join canvas since user is already authenticated
      this.createOrJoinDefaultCanvas();
    }

    console.log('CollabCanvas initialized successfully');

    // Hide loading screen
    this.uiManager.hideLoading();
    } catch (error) {
      console.error('❌ Failed to initialize CollabCanvas:', error);

      // Show error message to user
      const loadingScreen = document.getElementById('loading');
      if (loadingScreen) {
        loadingScreen.innerHTML = `
          <div style="color: #ff6b6b; text-align: center;">
            <h2>Failed to load CollabCanvas</h2>
            <p>${error.message}</p>
            <button onclick="location.reload()">Retry</button>
          </div>
        `;
      }
    }
  }

  async initAuth() {
    // Initialize auth modal
    this.authModal = new AuthModal();

    // Listen for auth state changes
    auth.onAuthStateChange((user) => {
      if (user) {
        console.log('User authenticated:', user.email);
        this.onUserAuthenticated();
      } else {
        console.log('User signed out');
        this.onUserSignedOut();
      }
    });

    // Show auth modal if not authenticated
    if (!auth.isAuthenticated) {
      // If we're waiting for email confirmation, show the confirmation message
      if (this.authModal.awaitingConfirmation) {
        this.authModal.showEmailConfirmationMessage()
      } else {
        this.authModal.open();
      }
    }
  }

  initSocket() {
    // Connect to socket server
    socketManager.connect();

    // Create or join default canvas
    this.createOrJoinDefaultCanvas();
  }

  async createOrJoinDefaultCanvas() {
    try {
      console.log('🎯 createOrJoinDefaultCanvas called, currentCanvasId:', this.currentCanvasId);

      // Check if there's a canvas ID in the URL
      const urlParams = new URLSearchParams(window.location.search);
      const canvasIdFromUrl = urlParams.get('canvas');

      console.log('🎯 URL params:', { canvasIdFromUrl });
      console.log('🎯 URL path:', window.location.pathname);

      if (canvasIdFromUrl) {
        // Join the canvas from URL (assume it's already a valid UUID)
        this.currentCanvasId = canvasIdFromUrl;
        console.log(`🔄 Joining canvas from URL: ${canvasIdFromUrl}`);
      } else if (window.location.pathname === '/default') {
        // Use the default canvas UUID for /default route
        // This is a persistent canvas that users can share and return to
        this.currentCanvasId = '550e8400-e29b-41d4-a716-446655440000';
        console.log(`🔄 Using default canvas: ${this.currentCanvasId}`);
      } else if (!this.currentCanvasId) {
        // For base URL or any other path, always create a new canvas
        console.log('🎯 Creating new canvas for base URL');
        try {
          this.currentCanvasId = await this.createNewCanvas();
          console.log(`🎯 Created new canvas ID: ${this.currentCanvasId}`);
        } catch (error) {
          console.error('🎯 Failed to create new canvas, using fallback:', error);
          this.currentCanvasId = '550e8400-e29b-41d4-a716-446655440000';
        }
      } else {
        console.log('🎯 Using existing canvas ID:', this.currentCanvasId);
      }

        console.log('🎯 Final canvas ID before join:', this.currentCanvasId);

        // Reset initial state flag when joining a new canvas
        this.initialStateCaptured = false;

        // Update URL to reflect the current canvas (for sharing and refreshing)
      this.uiManager.updateCanvasUrl();

      socketManager.joinCanvas(this.currentCanvasId);
      this.uiManager.updateCanvasInfo();

      // Add current user to online users set immediately (they'll be in canvas state too)
      if (auth.userId) {
        this.onlineUsers.add(auth.userId);
        this.uiManager.updatePresenceDisplay();
      }
    } catch (error) {
      console.error('Error creating/joining canvas:', error);
    }
  }

  async createNewCanvas() {
    try {
      console.log('🔄 createNewCanvas called, auth.userId:', auth.userId);
      console.log('🔄 Supabase available:', !!supabase);

      // First check if Supabase is properly configured
      if (!supabase) {
        throw new Error('Supabase client not initialized');
      }

      // Generate a unique name for the canvas
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const canvasName = `Canvas ${timestamp}-${randomSuffix}`;

      // Create a new canvas
      console.log('🔄 Creating new canvas:', canvasName);
      const { data: newCanvas, error } = await supabase
        .from('canvases')
        .insert({
          name: canvasName,
          created_by: auth.userId
        })
        .select('id, name')
        .single();

      console.log('🔄 Canvas creation result:', { newCanvas, error });

      if (error) throw error;

      console.log('🔄 Created new canvas:', newCanvas);
      return newCanvas.id;
    } catch (error) {
      console.error('Error creating new canvas:', error);
      // Fallback to a hardcoded UUID if database operations fail
      console.log('🔄 Using fallback UUID due to error:', error.message);
      return '550e8400-e29b-41d4-a716-446655440000';
    }
  }

  onUserAuthenticated() {
    const isNowAuthenticated = auth.isAuthenticated;

    // Only run authentication logic if user just became authenticated
    if (isNowAuthenticated && !this.wasAuthenticated) {
      console.log('User just became authenticated, initializing connection...');

      // Close auth modal
      if (this.authModal) {
        this.authModal.close();
      }

      // Initialize socket connection if not connected
      if (!socketManager.isConnected) {
        this.initSocket();
      }

      // Create or join the default canvas now that user is authenticated
      this.createOrJoinDefaultCanvas();
    }

    // Update UI to show authenticated state
    this.uiManager.updateAuthUI();

    // Update the flag for next time
    this.wasAuthenticated = isNowAuthenticated;
  }

  onUserSignedOut() {
    // Disconnect socket
    socketManager.disconnect();

    // Clear remote state
    this.remoteObjects.clear();
    this.remoteCursors.clear();

    // Clear all visual cursors
    if (this.cursorManager) {
      this.cursorManager.clearAllCursors();
    }

    // Reset confirmation state
    if (this.authModal) {
      this.authModal.awaitingConfirmation = false;
      this.authModal.pendingEmail = null;
    }

    // Reset authentication flag
    this.wasAuthenticated = false;

    // Remove current user from online users
    if (auth.userId) {
      this.onlineUsers.delete(auth.userId);
      this.uiManager.updatePresenceDisplay();
    }

    // Show auth modal
    if (this.authModal) {
      this.authModal.open();
    }

    // Update UI
    this.uiManager.updateAuthUI();
  }






  update() {
    // Per-frame updates go here
    // This is called every frame by the renderer

    // Update camera coordinates display
    const camera = this.scene.getCamera();
    const coordsElement = document.getElementById('coordinates');
    if (coordsElement) {
      coordsElement.textContent = `X: ${camera.position.x.toFixed(1)}, Y: ${camera.position.y.toFixed(1)}, Z: ${camera.position.z.toFixed(1)}`;
    }

    // Update cursor manager
    if (this.cursorManager) {
      this.cursorManager.update()
    }

    // Update object controls position if visible
    if (this.objectControls && this.transform && this.transform.isAttached()) {
      const hasMulti = this.transform.multiSelectObjects && this.transform.multiSelectObjects.length > 0;
      if (hasMulti) {
        const all = [this.transform.attachedObject, ...this.transform.multiSelectObjects];
        this.objectControls.update(all);
      } else {
        this.objectControls.update(this.transform.attachedObject);
      }
    }

    // Update cursor position for remote users (throttled)
    if (socketManager.isConnected && this.currentCanvasId) {
      const now = Date.now()
      if (!this.lastCursorUpdate || now - this.lastCursorUpdate > 50) { // Throttle to 20fps
        this.updateCursorPosition();
        this.lastCursorUpdate = now
      }
    }
  }

  updateCursorPosition() {
    if (!socketManager.isConnected || !this.cursorManager) return

    // Get 3D position from mouse coordinates
    const worldPosition = this.cursorManager.get3DPositionFromMouse()
    // console.log('🖱️ Updating cursor position:', worldPosition.x, worldPosition.y, worldPosition.z)

    // Update local cursor position for current user
    if (auth.userId && this.cursorManager.getCursor(auth.userId)) {
      this.cursorManager.updateCursorPosition(auth.userId, {
        x: worldPosition.x,
        y: worldPosition.y,
        z: worldPosition.z
      }, Date.now())
    }

    // Send cursor update with actual 3D coordinates
    socketManager.updateCursor({
      x: worldPosition.x,
      y: worldPosition.y,
      z: worldPosition.z
    })
  }


  handleObjectTransform(object) {
    // Throttle object updates for smooth dragging (60fps)
    // But allow resize updates more frequently for better sync
    const now = Date.now();
    const throttleTime = this.transform?.getMode() === 'resize' ? 8 : 16; // 120fps for resize, 60fps for others
    if (now - this.lastObjectUpdate < throttleTime) {
      return;
    }
    this.lastObjectUpdate = now;

    // Broadcast primary and any multi-selected secondary objects during drag
    if (this.shapeManager && socketManager.isConnected && this.currentCanvasId) {
      const maybeBroadcast = (mesh) => {
        const shp = this.shapeManager.findShapeByMesh(mesh);
        if (!shp) return;
        const data = {
          id: shp.id,
          position_x: mesh.position.x,
          position_y: mesh.position.y,
          position_z: mesh.position.z,
          rotation_x: mesh.rotation.x,
          rotation_y: mesh.rotation.y,
          rotation_z: mesh.rotation.z,
          scale_x: mesh.scale.x,
          scale_y: mesh.scale.y,
          scale_z: mesh.scale.z
        };
        socketManager.updateObject(shp.id, data);
      };

      // Primary object
      maybeBroadcast(object);

      // Secondary objects in multi-select
      if (this.transform?.multiSelectObjects && this.transform.multiSelectObjects.length > 0) {
        this.transform.multiSelectObjects.forEach(m => maybeBroadcast(m));
      }
    }
  }

  handleDragStart(object) {
    // Begin capturing state for undo functionality
    if (this.historyManager) {
      const selectedShapeIds = Array.from(this.shapeManager.selectedShapes);
      this.historyManager.beginUpdate(this.shapeManager, selectedShapeIds);
    }
  }

  handleDragEnd(object) {
    const isResize = this.transform && this.transform.getMode() === 'resize';
    // If we were in resize mode, bake the scale into geometry
    if (isResize) {
      // Handle primary object
      const shape = this.shapeManager.findShapeByMesh(object);
      if (shape) {
        // Capture the scale delta BEFORE baking (for undo/redo)
        const scaleDelta = {
          x: object.scale.x,
          y: object.scale.y,
          z: object.scale.z
        };

        // Pass scale delta to history manager before baking
        if (this.historyManager) {
          this.historyManager.captureScaleDelta(shape.id, scaleDelta);
        }

        // Bake the scale transform into the geometry
        this.shapeManager.bakeShapeScale(shape.id);

        // Broadcast the updated geometry to other users (after baking)
        if (socketManager.isConnected && this.currentCanvasId) {
          const objectData = {
            id: shape.id,
            position_x: object.position.x,
            position_y: object.position.y,
            position_z: object.position.z,
            rotation_x: object.rotation.x,
            rotation_y: object.rotation.y,
            rotation_z: object.rotation.z,
            scale_x: 1,
            scale_y: 1,
            scale_z: 1,
            color: shape.properties.color || '#ffffff',
            geometry: shape.serializeGeometry() // Geometry is single source of truth
          };

          socketManager.updateObject(shape.id, objectData);
          console.log('📤 Broadcasted resize with baked geometry:', shape.id);
        }
      }

      // Handle multi-selected objects
      if (this.transform.multiSelectObjects && this.transform.multiSelectObjects.length > 0) {
        this.transform.multiSelectObjects.forEach(multiObj => {
          const multiShape = this.shapeManager.findShapeByMesh(multiObj);
          if (multiShape) {
            // Capture scale delta for history
            const multiScaleDelta = {
              x: multiObj.scale.x,
              y: multiObj.scale.y,
              z: multiObj.scale.z
            };

            if (this.historyManager) {
              this.historyManager.captureScaleDelta(multiShape.id, multiScaleDelta);
            }

            // Bake the scale for multi-selected object
            this.shapeManager.bakeShapeScale(multiShape.id);

            // Broadcast updates for multi-selected objects
            if (socketManager.isConnected && this.currentCanvasId) {
              const multiObjectData = {
                id: multiShape.id,
                position_x: multiObj.position.x,
                position_y: multiObj.position.y,
                position_z: multiObj.position.z,
                rotation_x: multiObj.rotation.x,
                rotation_y: multiObj.rotation.y,
                rotation_z: multiObj.rotation.z,
                scale_x: 1,
                scale_y: 1,
                scale_z: 1,
                color: multiShape.properties.color || '#ffffff',
                geometry: multiShape.serializeGeometry()
              };

              socketManager.updateObject(multiShape.id, multiObjectData);
              console.log('📤 Broadcasted multi-resize with baked geometry:', multiShape.id);
            }
          }
        });
      }
    } else {
      // Non-resize: send a final authoritative update for all involved meshes
      if (socketManager.isConnected && this.currentCanvasId) {
        const finalize = (mesh) => {
          const shp = this.shapeManager.findShapeByMesh(mesh);
          if (!shp) return;
          const data = {
            id: shp.id,
            position_x: mesh.position.x,
            position_y: mesh.position.y,
            position_z: mesh.position.z,
            rotation_x: mesh.rotation.x,
            rotation_y: mesh.rotation.y,
            rotation_z: mesh.rotation.z,
            scale_x: mesh.scale.x,
            scale_y: mesh.scale.y,
            scale_z: mesh.scale.z,
            color: shp.properties.color || '#ffffff'
          };
          socketManager.updateObject(shp.id, data);
        };

        finalize(object);
        if (this.transform?.multiSelectObjects && this.transform.multiSelectObjects.length > 0) {
          this.transform.multiSelectObjects.forEach(m => finalize(m));
        }
      }
    }

    // Commit the update operation for undo functionality
    if (this.historyManager) {
      const selectedShapeIds = Array.from(this.shapeManager.selectedShapes);
      this.historyManager.commitUpdate(this.shapeManager, selectedShapeIds);
      this.uiManager.updateUndoRedoButtonStates();
    }
  }

  /**
   * Handle text editing updates
   */
  handleTextEdited(detail) {
    const { shapeId, oldText, newText } = detail;

    // Find the shape
    const shape = this.shapeManager.getShape(shapeId);
    if (!shape) return;

    // Update shape properties
    shape.properties.text = newText;

    // Broadcast text change to other users
    if (socketManager.isConnected && this.currentCanvasId) {
      const objectData = {
        id: shape.id,
        position_x: shape.mesh.position.x,
        position_y: shape.mesh.position.y,
        position_z: shape.mesh.position.z,
        rotation_x: shape.mesh.rotation.x,
        rotation_y: shape.mesh.rotation.y,
        rotation_z: shape.mesh.rotation.z,
        scale_x: shape.mesh.scale.x,
        scale_y: shape.mesh.scale.y,
        scale_z: shape.mesh.scale.z,
        color: shape.properties.color || '#ffffff',
        geometry: shape.serializeGeometry(),
        properties: shape.properties
      };

      socketManager.updateObject(shape.id, objectData);
      console.log('📤 Broadcasted text edit:', shape.id, newText);
    }

    // Record in history for undo/redo
    if (this.historyManager) {
      // Create a simple update record for the text change
      const selectedShapeIds = Array.from(this.shapeManager.selectedShapes);
      this.historyHelper.beginUpdateCapture();

      // The text change is already applied, so we just need to commit it
      this.historyManager.commitUpdate(this.shapeManager, selectedShapeIds);
      this.uiManager.updateUndoRedoButtonStates();
    }
  }

  undo() {
    this.historyHelper.undo();
  }

  redo() {
    this.historyHelper.redo();
  }

  /**
   * Clear the entire canvas
   */
  clearCanvas() {
    console.log('Clearing entire canvas...');

    // Get all shape IDs before clearing
    const allShapeIds = Array.from(this.shapeManager.shapes.keys());

    if (allShapeIds.length === 0) {
      this.uiManager.showNotification('Canvas is already empty', 'info');
      return;
    }

    // Record the delete action in history for undo/redo
    if (this.historyManager) {
      this.historyManager.pushDelete(allShapeIds, this.shapeManager);
      this.uiManager.updateUndoRedoButtonStates();
    }

    // Clear all shapes
    this.shapeManager.clear();

    // Broadcast clear action to other users
    if (this.socketManager && this.socketManager.isConnected && this.currentCanvasId) {
      // Send delete messages for each shape
      allShapeIds.forEach(shapeId => {
        this.socketManager.deleteObject(shapeId);
      });
    }

    this.uiManager.showNotification(`Cleared ${allShapeIds.length} shape(s) from canvas`, 'success');
  }








  dispose() {
    if (this.renderer) {
      this.renderer.stop();
    }
    if (this.grid) {
      this.grid.dispose();
    }
    if (this.controls) {
      this.controls.dispose();
    }
    if (this.scene) {
      this.scene.dispose();
    }
    if (this.authModal) {
      this.authModal.dispose();
    }
    if (socketManager) {
      socketManager.disconnect();
    }
  }
}
